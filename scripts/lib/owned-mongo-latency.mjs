import assert from 'node:assert/strict'
import { createServer, connect } from 'node:net'

// Loopback-only transport for owned test replica sets. Never accepts a remote DB URI.
export async function startOwnedMongoLatencyProxy(targetPort, initialDelayMs = 0) {
  assert(Number.isSafeInteger(targetPort) && targetPort > 0 && targetPort !== 3000)
  let delayMs = initialDelayMs
  const sockets = new Set()
  const stats = { clientMessages: 0, serverMessages: 0, opcodes: {} }
  const forward = (source, destination, side) => {
    let pending = Buffer.alloc(0), queue = Promise.resolve()
    source.on('data', bytes => {
      pending = Buffer.concat([pending, bytes])
      while (pending.length >= 16) {
        const length = pending.readInt32LE(0)
        if (length < 16 || length > 64 * 1024 * 1024) { source.destroy(); destination.destroy(); return }
        if (pending.length < length) break
        const frame = pending.subarray(0, length); pending = pending.subarray(length)
        const opcode = frame.readInt32LE(12); stats[side]++; stats.opcodes[side + ':' + opcode] = (stats.opcodes[side + ':' + opcode] || 0) + 1
      }
      source.pause()
      queue = queue.then(() => new Promise(resolve => setTimeout(resolve, delayMs)))
        .then(() => new Promise((resolve, reject) => destination.destroyed ? resolve() : destination.write(bytes, error => error ? reject(error) : resolve())))
        .then(() => source.resume()).catch(() => { source.destroy(); destination.destroy() })
    })
    source.on('end', () => { void queue.finally(() => destination.end()) })
  }
  const server = createServer(socket => {
    const target = connect({ host: '127.0.0.1', port: targetPort })
    for (const s of [socket, target]) { sockets.add(s); s.on('close', () => sockets.delete(s)) }
    socket.on('error', () => target.destroy()); target.on('error', () => socket.destroy())
    target.once('connect', () => { forward(socket, target, 'clientMessages'); forward(target, socket, 'serverMessages') })
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return { port: server.address().port, stats, setLatency(ms) { assert(Number.isFinite(ms) && ms >= 0 && ms <= 300); delayMs = ms }, async close() { for (const s of sockets) s.destroy(); await new Promise(resolve => server.close(resolve)) } }
}
