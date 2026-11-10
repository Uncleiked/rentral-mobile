import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated'
import { BrandMark } from './BrandLogo'
import { createLaunchSequence } from '../lib/launch-sequence'
import { brandType, colors, fonts, motion, space } from '../theme'

const markReveal = { from: { transform: [{ scale: 0.96 }] }, to: { transform: [{ scale: 1 }] } }
const wordmarkReveal = { from: { opacity: 0 }, to: { opacity: 1 } }
const leave = { '0%': { opacity: 1 }, '72%': { opacity: 1 }, '100%': { opacity: 0 } }
const enterCurve = cubicBezier(0.23, 1, 0.32, 1)

export function LaunchIntro({ onReady, onComplete }: { onReady: () => void; onComplete: () => void }) {
  const reduced = useReducedMotion()
  const [laidOut, setLaidOut] = useState(false), [imageReady, setImageReady] = useState(false), [started, setStarted] = useState(false)
  const sequence = useRef<ReturnType<typeof createLaunchSequence> | null>(null)
  useEffect(() => {
    const current = createLaunchSequence({
      duration: reduced ? motion.reducedLaunchDuration : motion.launchDuration,
      safetyTimeout: motion.launchSafety,
      onStart: () => { setStarted(true); onReady() },
      onFinish: onComplete,
    })
    sequence.current = current
    return () => { current.dispose(); sequence.current = null }
  }, [onReady, onComplete, reduced])
  useEffect(() => { if (laidOut && imageReady) sequence.current?.ready() }, [laidOut, imageReady, reduced, onReady, onComplete])
  const duration = reduced ? motion.reducedLaunchDuration : motion.launchDuration

  return <Animated.View testID="rentral-launch" accessible accessibilityRole="image" accessibilityLabel="Opening Rentral" accessibilityViewIsModal
    onLayout={() => setLaidOut(true)} style={[styles.overlay, started ? { animationName: leave, animationDuration: duration, animationTimingFunction: enterCurve, animationFillMode: 'forwards' } : undefined]}>
    <View style={styles.anchor}>
      <Animated.View style={started && !reduced ? { animationName: markReveal, animationDuration: motion.launchReveal, animationTimingFunction: enterCurve, animationFillMode: 'both' } : undefined}>
        <BrandMark size={brandType.launch.mark} onLoadEnd={() => setImageReady(true)} />
      </Animated.View>
      <Animated.View style={[styles.wordmarkPosition, !started && !reduced ? styles.hidden : undefined, started && !reduced ? { animationName: wordmarkReveal, animationDuration: motion.wordmarkReveal, animationDelay: motion.wordmarkDelay, animationTimingFunction: enterCurve, animationFillMode: 'both' } : undefined]}>
        <Text accessible={false} style={styles.wordmark}>rentral</Text>
      </Animated.View>
    </View>
  </Animated.View>
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  anchor: { width: brandType.launch.mark, height: brandType.launch.mark, alignItems: 'center' },
  wordmarkPosition: { position: 'absolute', top: brandType.launch.mark + space.sm, minWidth: 200, alignItems: 'center' },
  hidden: { opacity: 0 },
  wordmark: { color: colors.text, fontFamily: fonts.semibold, fontSize: brandType.launch.wordmark, letterSpacing: -1.8 },
})
