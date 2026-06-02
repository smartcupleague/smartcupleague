export const PREDICTION_PLACED_EVENT = 'prediction:placed';

export function dispatchPredictionPlaced(matchId: string | number) {
  window.dispatchEvent(new CustomEvent(PREDICTION_PLACED_EVENT, { detail: { matchId: String(matchId) } }));
}
