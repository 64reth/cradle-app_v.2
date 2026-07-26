import { onRequest as alphaDiagnostics } from "./api/alpha/diagnostics";
import { onRequest as alphaEvents } from "./api/alpha/events";
import { onRequest as alphaFeedback } from "./api/alpha/feedback";
import { onRequest as authHouseholds } from "./api/auth/households";
import { onRequest as authJoin } from "./api/auth/join";
import { onRequest as authSession } from "./api/auth/session";
import { onRequest as authRefresh } from "./api/auth/session/refresh";
import { onRequest as authSessions } from "./api/auth/sessions";
import { onRequest as authRevokeAll } from "./api/auth/sessions/revoke-all";
import { onRequest as authSignIn } from "./api/auth/sign-in";
import { onRequest as authSignOut } from "./api/auth/sign-out";
import { onRequest as authExchange } from "./api/auth/supabase/exchange";
import { onRequest as dashboard } from "./api/dashboard";
import { onRequest as opsAccounts } from "./api/ops/accounts";
import { onRequest as opsAccount } from "./api/ops/accounts/[accountId]";
import { onRequest as event } from "./api/household/events/[eventId]";
import { onRequest as events } from "./api/household/events/index";
import { onRequest as invitations } from "./api/household/invitations";
import { onRequest as invites } from "./api/household/invites/index";
import { onRequest as inviteRegen } from "./api/household/invites/[inviteId]/regenerate";
import { onRequest as inviteRevoke } from "./api/household/invites/[inviteId]/revoke";
import { onRequest as joinRequests } from "./api/household/join-requests/index";
import { onRequest as joinApprove } from "./api/household/join-requests/[requestId]/approve";
import { onRequest as joinDecline } from "./api/household/join-requests/[requestId]/decline";
import { onRequest as mealPlans } from "./api/household/meal-plans/index";
import { onRequest as mealPlan } from "./api/household/meal-plans/[planId]";
import { onRequest as mealRotations } from "./api/household/meal-rotations/index";
import { onRequest as mealRotation } from "./api/household/meal-rotations/[rotationId]";
import { onRequest as mealDuplicates } from "./api/household/meals/duplicates";
import { onRequest as mealFavourites } from "./api/household/meals/favourites";
import { onRequest as meals } from "./api/household/meals/index";
import { onRequest as mealPreferences } from "./api/household/meals/preferences";
import { onRequest as mealSuggestions } from "./api/household/meals/suggestions";
import { onRequest as member } from "./api/household/members/[memberId]";
import { onRequest as memberAvatar } from "./api/household/members/[memberId]/avatar";
import { onRequest as memberCompanion } from "./api/household/members/[memberId]/companion";
import { onRequest as memberSuspend } from "./api/household/members/[memberId]/suspend";
import { onRequest as members } from "./api/household/members/index";
import { onRequest as pet } from "./api/household/pets/[petId]";
import { onRequest as pets } from "./api/household/pets/index";
import { onRequest as room } from "./api/household/rooms/[roomId]";
import { onRequest as rooms } from "./api/household/rooms/index";
import { onRequest as roomReorder } from "./api/household/rooms/reorder";
import { onRequest as routineApply } from "./api/household/routine-setup/apply";
import { onRequest as setup } from "./api/household/setup/index";
import { onRequest as setupLeadership } from "./api/household/setup/leadership";
import { onRequest as setupMembers } from "./api/household/setup/members-complete";
import { onRequest as setupCompanion } from "./api/household/setup/avatar-complete";
import { onRequest as setupRooms } from "./api/household/setup/rooms-complete";
import { onRequest as setupPets } from "./api/household/setup/pets-complete";
import { onRequest as setupComplete } from "./api/household/setup/complete";
import { onRequest as system } from "./api/household/systems/[systemId]";
import { onRequest as systems } from "./api/household/systems/index";
import { onRequest as suggestion } from "./api/household/task-suggestions/[suggestionId]";
import { onRequest as suggestionReview } from "./api/household/task-suggestions/[suggestionId]/review";
import { onRequest as suggestionWithdraw } from "./api/household/task-suggestions/[suggestionId]/withdraw";
import { onRequest as suggestions } from "./api/household/task-suggestions/index";
import { onRequest as taskComplete } from "./api/household/tasks/[taskId]/complete";
import { onRequest as taskHelp } from "./api/household/tasks/[taskId]/help";
import { onRequest as tasks } from "./api/household/tasks/index";
import { onRequest as invite } from "./api/invites/[reference]";
import { onRequest as inviteAccept } from "./api/invites/[reference]/accept";
import { onRequest as avatar } from "./api/me/avatar";
import { onRequest as companion } from "./api/me/companion";
import { onRequest as me } from "./api/me/index";
import { onRequest as interests } from "./api/me/interests/index";
import { onRequest as interest } from "./api/me/interests/[interestId]";
import { onRequest as together } from "./api/together/index";
import { onRequest as togetherGenerate } from "./api/together/generate";
import { onRequest as togetherToday } from "./api/together/today";
import { onRequest as moment } from "./api/together/moments/[momentId]";
import { onRequest as moments } from "./api/together/moments/index";
import { onRequest as momentAccept } from "./api/together/[momentId]/accept";
import { onRequest as momentComplete } from "./api/together/[momentId]/complete";
import { onRequest as momentMemory } from "./api/together/[momentId]/memory";
import { onRequest as momentSave } from "./api/together/[momentId]/save";
import { onRequest as momentSkip } from "./api/together/[momentId]/skip";
import { onRequest as momentStart } from "./api/together/[momentId]/start";
import { onRequest as momentSwap } from "./api/together/[momentId]/swap";
import { onRequest as traditions } from "./api/together/traditions/index";
import { onRequest as tradition } from "./api/together/traditions/[traditionId]";
import { onRequestGet as health } from "./health";
import { onRequest as middleware } from "./_middleware";
import { failure, handleApiRequest, notFoundError } from "./api/http";
import type { CradleEnv } from "./api/types";

type WorkerEnv = CradleEnv & { ASSETS: Fetcher };
type PagesContext = { request: Request; env: WorkerEnv; params: Record<string, string> };
type Handler = (context: PagesContext) => Promise<Response> | Response;
type Route = { pattern: string; handler: Handler };

// Existing function handlers have deliberately narrower context types for their
// route parameters. `never` keeps this adapter type-safe without weakening the
// individual handlers to `any`, while the dispatch below supplies the complete
// context at runtime.
const route = <T extends (context: never) => Promise<Response> | Response>(pattern: string, handler: T): Route => ({ pattern, handler: handler as unknown as Handler });
const routes: Route[] = [
  route("/health", health), route("/api/alpha/diagnostics", alphaDiagnostics), route("/api/alpha/events", alphaEvents), route("/api/alpha/feedback", alphaFeedback),
  route("/api/auth/households", authHouseholds), route("/api/auth/join", authJoin), route("/api/auth/session", authSession), route("/api/auth/session/refresh", authRefresh), route("/api/auth/sessions", authSessions), route("/api/auth/sessions/revoke-all", authRevokeAll), route("/api/auth/sign-in", authSignIn), route("/api/auth/sign-out", authSignOut), route("/api/auth/supabase/exchange", authExchange),
  route("/api/dashboard", dashboard), route("/api/ops/accounts", opsAccounts), route("/api/ops/accounts/[accountId]", opsAccount),
  route("/api/household/events", events), route("/api/household/events/[eventId]", event), route("/api/household/invitations", invitations), route("/api/household/invites", invites), route("/api/household/invites/[inviteId]/regenerate", inviteRegen), route("/api/household/invites/[inviteId]/revoke", inviteRevoke), route("/api/household/join-requests", joinRequests), route("/api/household/join-requests/[requestId]/approve", joinApprove), route("/api/household/join-requests/[requestId]/decline", joinDecline),
  route("/api/household/meal-plans", mealPlans), route("/api/household/meal-plans/[planId]", mealPlan), route("/api/household/meal-rotations", mealRotations), route("/api/household/meal-rotations/[rotationId]", mealRotation), route("/api/household/meals", meals), route("/api/household/meals/duplicates", mealDuplicates), route("/api/household/meals/favourites", mealFavourites), route("/api/household/meals/preferences", mealPreferences), route("/api/household/meals/suggestions", mealSuggestions),
  route("/api/household/members", members), route("/api/household/members/[memberId]", member), route("/api/household/members/[memberId]/avatar", memberAvatar), route("/api/household/members/[memberId]/companion", memberCompanion), route("/api/household/members/[memberId]/suspend", memberSuspend), route("/api/household/pets", pets), route("/api/household/pets/[petId]", pet), route("/api/household/rooms", rooms), route("/api/household/rooms/[roomId]", room), route("/api/household/rooms/reorder", roomReorder),
  route("/api/household/routine-setup/apply", routineApply), route("/api/household/setup", setup), route("/api/household/setup/leadership", setupLeadership), route("/api/household/setup/members-complete", setupMembers), route("/api/household/setup/avatar-complete", setupCompanion), route("/api/household/setup/rooms-complete", setupRooms), route("/api/household/setup/pets-complete", setupPets), route("/api/household/setup/complete", setupComplete), route("/api/household/systems", systems), route("/api/household/systems/[systemId]", system), route("/api/household/task-suggestions", suggestions), route("/api/household/task-suggestions/[suggestionId]", suggestion), route("/api/household/task-suggestions/[suggestionId]/review", suggestionReview), route("/api/household/task-suggestions/[suggestionId]/withdraw", suggestionWithdraw), route("/api/household/tasks", tasks), route("/api/household/tasks/[taskId]/complete", taskComplete), route("/api/household/tasks/[taskId]/help", taskHelp),
  route("/api/invites/[reference]", invite), route("/api/invites/[reference]/accept", inviteAccept), route("/api/me", me), route("/api/me/avatar", avatar), route("/api/me/companion", companion), route("/api/me/interests", interests), route("/api/me/interests/[interestId]", interest),
  route("/api/together", together), route("/api/together/generate", togetherGenerate), route("/api/together/today", togetherToday), route("/api/together/moments", moments), route("/api/together/moments/[momentId]", moment), route("/api/together/[momentId]/accept", momentAccept), route("/api/together/[momentId]/complete", momentComplete), route("/api/together/[momentId]/memory", momentMemory), route("/api/together/[momentId]/save", momentSave), route("/api/together/[momentId]/skip", momentSkip), route("/api/together/[momentId]/start", momentStart), route("/api/together/[momentId]/swap", momentSwap), route("/api/together/traditions", traditions), route("/api/together/traditions/[traditionId]", tradition)
].sort((left, right) => right.pattern.split("/").length - left.pattern.split("/").length);

function matched(pattern: string, pathname: string): { params: Record<string, string> } | null {
  const expected = pattern.split("/").filter(Boolean); const actual = pathname.split("/").filter(Boolean);
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < expected.length; index += 1) {
    const segment = expected[index];
    if (segment.startsWith("[") && segment.endsWith("]")) params[segment.slice(1, -1)] = decodeURIComponent(actual[index]);
    else if (segment !== actual[index]) return null;
  }
  return { params };
}

async function dispatch(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url); const found = routes.map((item) => ({ item, match: matched(item.pattern, url.pathname) })).find(({ match }) => match);
  if (found) return found.item.handler({ request, env, params: found.match?.params || {} });
  if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
    return handleApiRequest(request, (requestIdValue) => failure(notFoundError(), requestIdValue));
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return middleware({ request, env, next: () => dispatch(request, env) });
  }
};
