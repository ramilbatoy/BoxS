export function formatMoney(cents: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function pesosToCents(pesos: number) {
  return Math.round(pesos * 100);
}

export function centsToPesos(cents: number) {
  return cents / 100;
}
