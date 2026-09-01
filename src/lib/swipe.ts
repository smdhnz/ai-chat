const flingVelocity = 600;

export function canStartSwipe(open: boolean, position: number, width: number) {
  return open || position <= width / 8;
}

export function shouldCompleteSwipe(position: number, threshold: number, velocity: number) {
  return velocity > flingVelocity || (velocity >= -flingVelocity && position > threshold);
}
