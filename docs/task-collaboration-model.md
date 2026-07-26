# Task collaboration model

## Dated household missions

Active due Routines materialise as one `household_task_instances` row per household, Routine, and local date. The occurrence snapshots its title, context, assignment mode, due period, selected Rotation turn, and lifecycle. `household_task_participants` stores required and helper contributions separately.

Generation is idempotent. Rotation advances only after a unique occurrence is inserted. History is retained across days; a new daily cycle creates new instances and does not rewrite prior completion.

Today’s Mission counts incomplete current-day instances only. It never counts Routine templates, paused/draft/archived Routines, completed work, future occurrences, or optional recommendations.

## Shared teams and completion

A Shared-team Routine creates one mission with multiple required contribution rows. Each selected person sees it in My Cradle. Signing off completes that person’s contribution. The mission enters **Waiting for team** until every required contribution is complete, then becomes **Complete**. A person who has signed off is not penalised for another person’s remaining contribution. Household admins may complete or override when necessary.

## Need a hand

An assigned person can choose the hand action and select another active Family member. The request preserves the original assignment and adds a helper contribution. The helper sees it in the **Help requested** card in My Cradle. Either the original assignee or helper may sign off the assisted mission. Requests and all task queries remain authenticated and household-scoped.

## Daily Family Status

For each person:

`(completed due contributions + contributions not yet due) / total required contributions today`

Tasks scheduled later do not lower the score. Missed or overdue incomplete contributions do. Late completion restores the score. A person with no work displays **Ready** and a full neutral-positive bar without receiving fabricated completion credit.

- 76–100%: green, joyful, **On track** or **All done**
- 51–75%: yellow-green/yellow, calm, **Doing well**
- 26–50%: amber, concerned/supportive, **Needs a hand**
- 0–25%: coral/red-orange, tired/supportive, **Needs support**

Colour is always paired with a percentage, verbal status, and accessible progress label. Task completion briefly switches the person’s cat to Joy and plays one gentle 950ms bounce/tilt. Reduced-motion users receive the Joy expression and a non-motion confirmation.

## Suggestions

Suggestions remain separate from dated missions. Accepting an idea does not silently create a Routine or task.
