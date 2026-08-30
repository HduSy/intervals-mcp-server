/**
 * Custom item tools: management of charts, custom fields, zones, etc.
 */

import { z } from "zod";
import { makeIntervalsRequest, isApiError } from "../api/client.js";
import { getConfig } from "../config.js";
import { formatCustomItemDetails, type Dict } from "../utils/formatting.js";
import { resolveAthleteId } from "../utils/validation.js";
import { textResult, apiErrorMessage, type ToolRegistrar } from "./shared.js";

/** Accept content as an object, or as a JSON string (parsed leniently). */
const ContentSchema = z
  .union([z.record(z.unknown()), z.string()])
  .optional()
  .transform((val, ctx): Record<string, unknown> | null => {
    if (val == null) return null;
    if (typeof val !== "string") return val;
    try {
      return JSON.parse(val) as Record<string, unknown>;
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "content must be valid JSON when passed as a string." });
      return z.NEVER;
    }
  });

const ITEM_TYPE_DESCRIPTION =
  "Type of custom item (e.g. FITNESS_CHART, TRACE_CHART, INPUT_FIELD, ACTIVITY_FIELD, INTERVAL_FIELD, ACTIVITY_STREAM, ACTIVITY_CHART, ACTIVITY_HISTOGRAM, ACTIVITY_HEATMAP, ACTIVITY_MAP, ACTIVITY_PANEL, ZONES)";
const CONTENT_DESCRIPTION =
  'Configuration content for the custom item as an object (optional). Important enum values:\n' +
  '- "type" field for INPUT_FIELD/ACTIVITY_FIELD: must be "numeric", "text", or "select" (NOT "number")\n' +
  '- "aggregate" field: must be "MIN", "SUM", "MAX", or "AVERAGE" (NOT "AVG")';

export const registerCustomItemTools: ToolRegistrar = (server) => {
  server.registerTool(
    "get_custom_items",
    {
      title: "Get Custom Items",
      description:
        "Get custom items (charts, custom fields, zones, etc.) for an athlete from Intervals.icu.",
      inputSchema: {
        athlete_id: z.string().optional(),
        api_key: z.string().optional(),
      },
    },
    async ({ athlete_id, api_key }) => {
      const config = getConfig();
      const { athleteId, error } = resolveAthleteId(athlete_id, config.athleteId);
      if (error) return textResult(error);

      const result = await makeIntervalsRequest(`/athlete/${athleteId}/custom-item`, {
        apiKey: api_key,
      });

      if (isApiError(result)) {
        return textResult(`Error fetching custom items: ${apiErrorMessage(result)}`);
      }
      if (result == null || (Array.isArray(result) && result.length === 0)) {
        return textResult(`No custom items found for athlete ${athleteId}.`);
      }

      let output = "Custom Items:\n\n";
      for (const item of result as Dict[]) {
        if (typeof item !== "object" || item === null) continue;
        output += `- ID: ${item["id"]}\n`;
        output += `  Name: ${item["name"] ?? "N/A"}\n`;
        output += `  Type: ${item["type"] ?? "N/A"}\n`;
        if (item["description"]) output += `  Description: ${item["description"]}\n`;
        output += "\n";
      }
      return textResult(output);
    },
  );

  server.registerTool(
    "get_custom_item_by_id",
    {
      title: "Get Custom Item By ID",
      description: "Get detailed information for a specific custom item from Intervals.icu.",
      inputSchema: {
        item_id: z.number().int().describe("The custom item ID"),
        athlete_id: z.string().optional(),
        api_key: z.string().optional(),
      },
    },
    async ({ item_id, athlete_id, api_key }) => {
      const config = getConfig();
      const { athleteId, error } = resolveAthleteId(athlete_id, config.athleteId);
      if (error) return textResult(error);

      const result = await makeIntervalsRequest(`/athlete/${athleteId}/custom-item/${item_id}`, {
        apiKey: api_key,
      });

      if (isApiError(result)) {
        return textResult(`Error fetching custom item: ${apiErrorMessage(result)}`);
      }
      if (typeof result !== "object" || result === null || Array.isArray(result)) {
        return textResult(`No custom item found with ID ${item_id}.`);
      }
      return textResult(formatCustomItemDetails(result as Dict));
    },
  );

  server.registerTool(
    "create_custom_item",
    {
      title: "Create Custom Item",
      description: "Create a new custom item for an athlete on Intervals.icu.",
      inputSchema: {
        name: z.string().describe("Name of the custom item"),
        item_type: z.string().describe(ITEM_TYPE_DESCRIPTION),
        athlete_id: z.string().optional(),
        api_key: z.string().optional(),
        description: z.string().optional().describe("Description of the custom item (optional)"),
        content: ContentSchema.describe(CONTENT_DESCRIPTION),
        visibility: z
          .string()
          .optional()
          .describe("Visibility setting: PRIVATE, FOLLOWERS, or PUBLIC (optional)"),
      },
    },
    async ({ name, item_type, athlete_id, api_key, description, content, visibility }) => {
      const config = getConfig();
      const { athleteId, error } = resolveAthleteId(athlete_id, config.athleteId);
      if (error) return textResult(error);

      const data: Dict = { name, type: item_type };
      if (description != null) data["description"] = description;
      if (content != null) data["content"] = content;
      if (visibility != null) data["visibility"] = visibility;

      const result = await makeIntervalsRequest(`/athlete/${athleteId}/custom-item`, {
        apiKey: api_key,
        data,
        method: "POST",
      });

      if (isApiError(result)) {
        return textResult(`Error creating custom item: ${apiErrorMessage(result)}`);
      }
      if (typeof result !== "object" || result === null || Array.isArray(result)) {
        return textResult("Error: Unexpected response when creating custom item.");
      }
      return textResult(
        `Successfully created custom item:\n\n${formatCustomItemDetails(result as Dict)}`,
      );
    },
  );

  server.registerTool(
    "update_custom_item",
    {
      title: "Update Custom Item",
      description: "Update an existing custom item for an athlete on Intervals.icu.",
      inputSchema: {
        item_id: z.number().int().describe("The custom item ID to update"),
        athlete_id: z.string().optional(),
        api_key: z.string().optional(),
        name: z.string().optional().describe("New name for the custom item (optional)"),
        item_type: z.string().optional().describe("New type for the custom item (optional)"),
        description: z.string().optional().describe("New description for the custom item (optional)"),
        content: ContentSchema.describe(CONTENT_DESCRIPTION),
        visibility: z
          .string()
          .optional()
          .describe("New visibility setting: PRIVATE, FOLLOWERS, or PUBLIC (optional)"),
      },
    },
    async ({ item_id, athlete_id, api_key, name, item_type, description, content, visibility }) => {
      const config = getConfig();
      const { athleteId, error } = resolveAthleteId(athlete_id, config.athleteId);
      if (error) return textResult(error);

      const data: Dict = {};
      if (name != null) data["name"] = name;
      if (item_type != null) data["type"] = item_type;
      if (description != null) data["description"] = description;
      if (content != null) data["content"] = content;
      if (visibility != null) data["visibility"] = visibility;

      const result = await makeIntervalsRequest(`/athlete/${athleteId}/custom-item/${item_id}`, {
        apiKey: api_key,
        data,
        method: "PUT",
      });

      if (isApiError(result)) {
        return textResult(`Error updating custom item: ${apiErrorMessage(result)}`);
      }
      if (typeof result !== "object" || result === null || Array.isArray(result)) {
        return textResult("Error: Unexpected response when updating custom item.");
      }
      return textResult(
        `Successfully updated custom item:\n\n${formatCustomItemDetails(result as Dict)}`,
      );
    },
  );

  server.registerTool(
    "delete_custom_item",
    {
      title: "Delete Custom Item",
      description: "Delete a custom item for an athlete from Intervals.icu.",
      inputSchema: {
        item_id: z.number().int().describe("The custom item ID to delete"),
        athlete_id: z.string().optional(),
        api_key: z.string().optional(),
      },
    },
    async ({ item_id, athlete_id, api_key }) => {
      const config = getConfig();
      const { athleteId, error } = resolveAthleteId(athlete_id, config.athleteId);
      if (error) return textResult(error);

      const result = await makeIntervalsRequest(`/athlete/${athleteId}/custom-item/${item_id}`, {
        apiKey: api_key,
        method: "DELETE",
      });

      if (isApiError(result)) {
        return textResult(`Error deleting custom item: ${apiErrorMessage(result)}`);
      }
      return textResult(`Successfully deleted custom item ${item_id}.`);
    },
  );
};
