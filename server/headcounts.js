// Shared invoice compatibility limit: Android stores each count as a Kotlin Int.
export const isValidHeadcount = value =>
  Number.isInteger(value) && value >= 0 && value <= 2147483647;
