import {
  Archive, ArchiveRestore, ArrowLeft, ArrowRight, Bath, BedDouble, Bell, Blocks, BrushCleaning,
  CalendarDays, CalendarClock, Check, CircleAlert, CircleCheck, CircleDashed, Clock3, CookingPot, Crown, DoorOpen, Droplets, Eye, EyeOff,
  HandHelping, HeartHandshake, House, LayoutDashboard, Lightbulb, ListChecks, ListTodo,
  Lock, LogOut, Map, Menu, Monitor, MoreHorizontal, Pencil, PawPrint, Plus, Recycle, RefreshCw,
  Search, Settings, Shirt, ShoppingCart, Sofa, Sparkles, Sprout, Table2, Toilet, Trash2,
  Utensils, UserRound, UsersRound, Warehouse, WashingMachine, X, type LucideIcon
} from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

export const CRADLE_ICON_NAMES = [
  "dashboard", "calendar", "settings", "search", "notifications", "add", "edit", "delete", "close", "back",
  "family", "member", "room", "pet", "meeting", "suggestion", "help",
  "kitchen", "bathroom", "bedroom", "livingRoom", "diningRoom", "hallway", "office", "utility", "garden", "garage", "playroom",
  "cleaning", "vacuum", "laundry", "dishes", "cooking", "recycling", "rubbish", "shopping", "watering", "plants", "petCare", "bed", "toilet", "bath", "shower",
  "success", "warning", "attention", "pending", "overdue", "complete",
  "forward", "menu", "save", "retry", "signOut", "more", "locked", "unlocked", "visible", "hidden", "progress", "sparkles", "recurring", "time", "today", "upcoming", "trip", "leadershipMeeting", "admin", "child", "household", "partner", "routine", "mission", "reset"
] as const;
export type CradleIconName = typeof CRADLE_ICON_NAMES[number];
export type CradleIconSize = "sm" | "md" | "lg";

const registry: Record<CradleIconName, LucideIcon> = {
  dashboard: LayoutDashboard, calendar: CalendarDays, settings: Settings, search: Search,
  notifications: Bell, add: Plus, edit: Pencil, delete: Trash2, close: X, back: ArrowLeft,
  family: UsersRound, member: UserRound, room: House, pet: PawPrint, meeting: UsersRound,
  suggestion: Lightbulb, help: HandHelping,
  kitchen: CookingPot, bathroom: Bath, bedroom: BedDouble, livingRoom: Sofa, diningRoom: Table2,
  hallway: DoorOpen, office: Monitor, utility: WashingMachine, garden: Sprout, garage: Warehouse, playroom: Blocks,
  cleaning: BrushCleaning, vacuum: BrushCleaning, laundry: Shirt, dishes: Utensils, cooking: CookingPot,
  recycling: Recycle, rubbish: Trash2, shopping: ShoppingCart, watering: Droplets, plants: Sprout,
  petCare: PawPrint, bed: BedDouble, toilet: Toilet, bath: Bath, shower: Droplets,
  success: CircleCheck, warning: CircleAlert, attention: CircleAlert, pending: CircleDashed, overdue: CircleAlert, complete: Check,
  forward: ArrowRight, menu: Menu, save: Archive, retry: RefreshCw, signOut: LogOut, more: MoreHorizontal,
  locked: Lock, unlocked: ArchiveRestore, visible: Eye, hidden: EyeOff, progress: ListTodo, sparkles: Sparkles,
  recurring: CalendarClock, time: Clock3, today: CalendarDays, upcoming: CalendarClock, trip: Map,
  leadershipMeeting: Crown, admin: Crown, child: UserRound, household: House, partner: HeartHandshake,
  routine: ListChecks, mission: ListTodo, reset: RefreshCw
};

const SIZE_PRESETS: Record<CradleIconSize, number> = { sm: 16, md: 20, lg: 24 };

export type CradleIconProps = Omit<ComponentPropsWithoutRef<"svg">, "name" | "size"> & {
  name: CradleIconName;
  size?: CradleIconSize | number;
  label?: string;
  decorative?: boolean;
};

export const CradleIcon = forwardRef<SVGSVGElement, CradleIconProps>(function CradleIcon({
  name, size = "md", label, decorative = false, strokeWidth = 2, ...props
}, ref) {
  const Icon = registry[name];
  const pixels = typeof size === "number" ? size : SIZE_PRESETS[size];
  return <Icon ref={ref} size={pixels} strokeWidth={strokeWidth} aria-hidden={decorative ? true : undefined}
    aria-label={decorative ? undefined : label} {...props} />;
});

// The component and its typed semantic registry intentionally share this public module.
// eslint-disable-next-line react-refresh/only-export-components
export const cradleIconRegistry = registry;
