import { AnimatePresence, motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { forwardRef, type PropsWithChildren } from "react";
import {
  cardVariants, dialogVariants, listItemVariants, pageVariants, reducedCardVariants,
  reducedDialogVariants, reducedListItemVariants, reducedPageVariants
} from "./variants";

type MotionPageProps = PropsWithChildren<HTMLMotionProps<"div">> & { motionKey?: string };
export function MotionPage({ children, className, motionKey, ...props }: MotionPageProps) {
  const reduced = useReducedMotion();
  return <motion.div key={motionKey} className={className} variants={reduced ? reducedPageVariants : pageVariants}
    initial="initial" animate="animate" exit="exit" {...props}>{children}</motion.div>;
}

type MotionCardProps = PropsWithChildren<HTMLMotionProps<"div">> & { interactive?: boolean };
export function MotionCard({ children, className, interactive = false, ...props }: MotionCardProps) {
  const reduced = useReducedMotion();
  return <motion.div className={className} variants={reduced ? reducedCardVariants : cardVariants}
    initial="initial" animate="animate" whileHover={interactive && !reduced ? { y: -2 } : undefined}
    whileTap={interactive && !reduced ? { scale: 0.99 } : undefined} {...props}>{children}</motion.div>;
}

type MotionListProps = PropsWithChildren<HTMLMotionProps<"div">>;
export function MotionList({ children, ...props }: MotionListProps) {
  return <motion.div layout {...props}>{children}</motion.div>;
}

type MotionListItemProps = PropsWithChildren<HTMLMotionProps<"div">>;
export function MotionListItem({ children, className, ...props }: MotionListItemProps) {
  const reduced = useReducedMotion();
  return <motion.div layout className={className} variants={reduced ? reducedListItemVariants : listItemVariants}
    initial="initial" animate="animate" exit="exit" {...props}>{children}</motion.div>;
}

type MotionButtonFeedbackProps = PropsWithChildren<HTMLMotionProps<"button">>;
export function MotionButtonFeedback({ children, disabled, ...props }: MotionButtonFeedbackProps) {
  const reduced = useReducedMotion();
  return <motion.button disabled={disabled} whileTap={!disabled && !reduced ? { scale: 0.985 } : undefined}
    {...props}>{children}</motion.button>;
}

export const MotionDialog = forwardRef<HTMLElement, PropsWithChildren<HTMLMotionProps<"section">>>(
  function MotionDialog({ children, ...props }, ref) {
    const reduced = useReducedMotion();
    return <motion.section ref={ref} variants={reduced ? reducedDialogVariants : dialogVariants}
      initial="initial" animate="animate" exit="exit" {...props}>{children}</motion.section>;
  }
);

export { AnimatePresence };
