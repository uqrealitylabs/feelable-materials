export function gaussianInfluence(
  distance: number,
  radius: number,
  strength = 1,
) {
  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(radius) ||
    !Number.isFinite(strength) ||
    radius <= 0 ||
    strength <= 0
  )
    return 0;

  const normalised = distance / radius;
  return Math.exp(-(normalised * normalised) * 2.4) * strength;
}
