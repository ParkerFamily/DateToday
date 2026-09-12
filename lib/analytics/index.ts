type Props = Record<string, string | number | boolean | null | undefined>;

export const analytics = {
  track(event: string, props?: Props): void {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.debug('[analytics]', event, props ?? {});
    }
  },
};
