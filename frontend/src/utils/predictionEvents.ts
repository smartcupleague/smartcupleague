export const PREDICTION_PLACED_EVENT = 'prediction:placed';

export type PredictionPlacedDetail = {
  matchId: string;
  predictedOutcome?: 'home' | 'draw' | 'away';
  matchPoolAmountPlanck?: string;
};

export function dispatchPredictionPlaced(
  matchId: string | number,
  detail: Omit<PredictionPlacedDetail, 'matchId'> = {},
) {
  window.dispatchEvent(new CustomEvent<PredictionPlacedDetail>(PREDICTION_PLACED_EVENT, {
    detail: { matchId: String(matchId), ...detail },
  }));
}
