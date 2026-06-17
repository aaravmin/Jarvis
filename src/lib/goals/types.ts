/**
 * Goals are the ANCHORS of Jarvis: every entity (contact, meeting, calendar event, email, task,
 * opportunity) links to one or more goals, and goals connect to each other through shared entities.
 * This file holds the in-app goal shapes; the relational model lives in the goals + goal_links +
 * goal_connections tables.
 */

export type Goal = {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
};

/** Entity kinds that can be anchored to a goal. */
export type GoalEntityType = "contact" | "opportunity" | "item" | "source";

/** A single entity↔goal link (one row of goal_links), as the UI consumes it. */
export type GoalLink = {
  id: string;
  goalId: string;
  entityType: GoalEntityType;
  entityId: string;
  rationale?: string;
  confidence?: number;
  reviewStatus: "review" | "accepted" | "dismissed";
};
