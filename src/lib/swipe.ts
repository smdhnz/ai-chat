const flingVelocity = 600;

export function shouldCompleteSwipe(position: number, threshold: number, velocity: number) {
  return velocity > flingVelocity || (velocity >= -flingVelocity && position > threshold);
}
