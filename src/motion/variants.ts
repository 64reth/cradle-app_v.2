import { motionDistance, motionDuration, motionEase } from "./config";

export const pageVariants = {
  initial: { opacity: 0, y: motionDistance.page },
  animate: { opacity: 1, y: 0, transition: { duration: motionDuration.normal, ease: motionEase.enter } },
  exit: { opacity: 0, transition: { duration: motionDuration.fast, ease: motionEase.exit } }
};

export const reducedPageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: motionDuration.fast } },
  exit: { opacity: 0, transition: { duration: motionDuration.instant } }
};

export const listItemVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: motionDuration.fast, ease: motionEase.enter } },
  exit: { opacity: 0, scale: 0.99, transition: { duration: motionDuration.fast, ease: motionEase.exit } }
};

export const reducedListItemVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: motionDuration.instant } },
  exit: { opacity: 0, transition: { duration: motionDuration.instant } }
};

export const cardVariants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: motionDuration.fast, ease: motionEase.enter } }
};

export const reducedCardVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: motionDuration.instant } }
};

export const dialogVariants = {
  initial: { opacity: 0, y: 6, scale: 0.995 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: motionDuration.fast, ease: motionEase.enter } },
  exit: { opacity: 0, y: 4, transition: { duration: motionDuration.instant, ease: motionEase.exit } }
};

export const reducedDialogVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: motionDuration.instant } },
  exit: { opacity: 0, transition: { duration: motionDuration.instant } }
};
