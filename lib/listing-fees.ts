// A product limit for optional host-entered fees, not a legal fee assessment.
// Configure the same public limit in both browser and server builds.
const MONEY_PATTERN = /^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$/;
const DEFAULT_FEE_LIMIT_NGN = "10000000";

export function optionalFeeLimitNgn(): string {
  const configured = process.env.NEXT_PUBLIC_MAX_OPTIONAL_LISTING_FEE_NGN;
  return configured && MONEY_PATTERN.test(configured) ? configured : DEFAULT_FEE_LIMIT_NGN;
}

function moneyKobo(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

export function validOptionalListingFee(value: string): boolean {
  return value === "" || (MONEY_PATTERN.test(value) && moneyKobo(value) <= moneyKobo(optionalFeeLimitNgn()));
}
