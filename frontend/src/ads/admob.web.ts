// Web no-op AdMob — mocks the rewarded ad with a 2.2s delay.
export const REWARDED_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917';
export type RewardResult = { rewarded: boolean; mocked: boolean };

export async function initAdMob() {
  // no-op on web
}

export function isAdMobAvailable(): boolean {
  return false;
}

export async function showRewardedAd(): Promise<RewardResult> {
  await new Promise((r) => setTimeout(r, 2200));
  return { rewarded: true, mocked: true };
}
