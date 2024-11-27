import { StaticDecode, Type as T } from "@sinclair/typebox";

export const approvalsRequiredSchema = T.Object(
  {
    /**
     * The amount of validations needed to consider a pull-request by a collaborator to be deemed eligible for
     * merge, defaults to 1.
     */
    collaborator: T.Number({ default: 1, minimum: 1, description: "The amount of validations needed to consider a pull-request by a collaborator to be deemed eligible for merge" }),
    /**
     * The amount of validations needed to consider a pull-request by a contributor to be deemed eligible for merge,
     * defaults to 2.
     */
    contributor: T.Number({ default: 2, minimum: 1, description: "The amount of validations needed to consider a pull-request by a contributor to be deemed eligible for merge" }),
  },
  { default: {} }
);

export const mergeTimeoutSchema = T.Object(
  {
    /**
     * The timespan to wait before merging a collaborator's pull-request, defaults to 3.5 days.
     */
    collaborator: T.String({
      default: "3.5 days",
      description: "The timespan to wait before merging a collaborator's pull-request",
      examples: ["1 day", "3.5 days"]
    }),
  },
  { default: {} }
);

export const reposSchema = T.Object(
  {
    /**
     * Repositories to watch for updates
     */
    monitor: T.Array(T.String({ minLength: 1 }), {
      default: [],
      description: "Repositories to watch for updates, if empty all are watched and if just owner is provided all repositories from that owner are watched.",
      examples: ["owner/repo", "owner"]
    }),
    /**
     * Repositories to ignore updates from
     */
    ignore: T.Array(T.String(), {
      default: [],
      description: "Repositories to ignore updates from, if empty all repositories are watched and if just owner is provided all repositories from that owner are ignored",
      examples: ["owner/repo", "owner"]
    }),
  },
  { default: {} }
);

const allowedReviewerRoles = T.Array(T.String(), {
  default: ["COLLABORATOR", "MEMBER", "OWNER"],
  description: "When considering a user for a task: which roles should be considered as having review authority? All others are ignored.",
  examples: [["COLLABORATOR", "MEMBER", "OWNER"], ["MEMBER", "OWNER"]]
});

export const pluginSettingsSchema = T.Object({
  approvalsRequired: T.Optional(approvalsRequiredSchema),
  mergeTimeout: T.Optional(mergeTimeoutSchema),
  /**
   * The list of organizations or repositories to watch for updates.
   */
  repos: T.Optional(reposSchema),
  allowedReviewerRoles: T.Optional(
    T.Transform(allowedReviewerRoles)
      .Decode((roles) => roles.map((role) => role.toUpperCase()))
      .Encode((roles) => roles.map((role) => role.toUpperCase()))
  ),
});

export type PluginSettings = StaticDecode<typeof pluginSettingsSchema>;
export type ReposWatchSettings = StaticDecode<typeof reposSchema>;
