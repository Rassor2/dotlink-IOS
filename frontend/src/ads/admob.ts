// AdMob rewarded ad wrapper.
// On native (iOS/Android dev/prod builds): uses real react-native-google-mobile-ads
// with the official Google TEST ad unit IDs by default. Replace the IDs in
// app.json and EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID with your real ones before
// shipping to the stores.
//
// On web and inside Expo Go: gracefully falls back to a mocked 2.2s "ad" so the
// UX flow is identical without requiring a native build.
//
// Public API:
//   showRewardedAd(): Promise<{ rewarded: boolean; mocked: boolean }>
//   isAdMobAvailable(): boolean

import { Platform } from 'react-native';
import Constants from 'expo-constants';

const isExpoGo = Constants.appOwnership === 'expo';

const ENV_UNIT = process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID;
// Google's official test rewarded ad unit
const GOOGLE_TEST_REWARDED = 'ca-app-pub-3940256099942544/5224354917';
export const REWARDED_UNIT_ID = (ENV_UNIT && ENV_UNIT.length > 0) ? ENV_UNIT : GOOGLE_TEST_REWARDED;

export type RewardResult = { rewarded: boolean; mocked: boolean };

let nativeImpl: null | {
  show: () => Promise<RewardResult>;
  initialize: () => Promise<void>;
  available: () => boolean;
} = null;

function loadNativeImpl() {
  if (nativeImpl) return nativeImpl;
  if (Platform.OS === 'web' || isExpoGo) {
    return null;
  }
  try {
    // Lazy require so Metro doesn't try to resolve native module on web
    // and to keep Expo Go from crashing if the package's native module is absent.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ads = require('react-native-google-mobile-ads');
    const mobileAds = ads.default;
    const { RewardedAd, RewardedAdEventType, AdEventType } = ads;

    let rewarded: any = null;
    let loaded = false;

    function createAndLoad() {
      rewarded = RewardedAd.createForAdRequest(REWARDED_UNIT_ID, {
        requestNonPersonalizedAdsOnly: true,
      });
      loaded = false;
      rewarded.addAdEventListener(AdEventType.LOADED, () => { loaded = true; });
      rewarded.load();
    }

    nativeImpl = {
      initialize: async () => {
        try {
          await mobileAds().initialize();
          createAndLoad();
        } catch {}
      },
      available: () => loaded,
      show: () => new Promise<RewardResult>((resolve) => {
        if (!rewarded || !loaded) {
          // Try to load and bail out as mocked if no ad in 4s
          if (!rewarded) createAndLoad();
          const timeout = setTimeout(() => resolve({ rewarded: true, mocked: true }), 4000);
          const t = setInterval(() => {
            if (loaded) {
              clearInterval(t);
              clearTimeout(timeout);
              showOnce(resolve);
            }
          }, 200);
          return;
        }
        showOnce(resolve);
      }),
    };

    function showOnce(resolve: (r: RewardResult) => void) {
      let earned = false;
      const unsubEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      });
      const unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
        unsubEarned();
        unsubClosed();
        // Reload for next time
        createAndLoad();
        resolve({ rewarded: earned, mocked: false });
      });
      try {
        rewarded.show();
      } catch {
        unsubEarned();
        unsubClosed();
        resolve({ rewarded: true, mocked: true });
      }
    }
    return nativeImpl;
  } catch {
    return null;
  }
}

export async function initAdMob() {
  const impl = loadNativeImpl();
  if (impl) await impl.initialize();
}

export function isAdMobAvailable(): boolean {
  const impl = loadNativeImpl();
  return !!impl && impl.available();
}

export async function showRewardedAd(): Promise<RewardResult> {
  const impl = loadNativeImpl();
  if (!impl) {
    // Mocked path (web, Expo Go) — simulate a 2.2s ad
    await new Promise((r) => setTimeout(r, 2200));
    return { rewarded: true, mocked: true };
  }
  return impl.show();
}
