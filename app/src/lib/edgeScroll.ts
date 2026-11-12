/**
 * The sideways scroll speed (px per frame) while a drag is at `x`, in a view from `left` to `right`: negative near the
 * left edge, positive near the right one, zero elsewhere. It rises linearly across the `zone` to `max`, which holds at
 * and beyond the edge.
 */
export function edgeSpeed(x: number, left: number, right: number, zone: number, max: number): number {
  // A view narrower than two zones splits at its middle: each side belongs to the nearer edge.
  const reach = Math.min(zone, (right - left) / 2)
  const fromLeft = x - left
  const fromRight = right - x
  if (fromLeft < reach) return -max * Math.min(1, (reach - fromLeft) / reach)
  if (fromRight < reach) return max * Math.min(1, (reach - fromRight) / reach)
  return 0
}
