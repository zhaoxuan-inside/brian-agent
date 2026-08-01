# INFO Extensions PRD: Work/Interact Query & Keyword Graph

## 1. Overview

This document describes backend extensions to support the Info Page (信息Page) frontend's Work/Interact browsing and Keyword Graph visualization features.

## 2. Data Model Mapping

The existing `user_messages` table is reused to provide Work/Interact semantics:

| Frontend Concept | Backend Mapping | Description |
|:---|:---|:---|
| `work_id` | `session_id` | A complete work session (chat session) |
| `interact_id` | `exchange_id` | One round of Q&A within a work |
| `msg_id` | `msg_id` / individual row `id` | Single message within an interact |

## 3. Route Definitions

All routes are mounted under `/api/memory` via `createMemoryRoutes`.

### 3.1 `GET /work/list` — Work List

Query works with optional filters and pagination.

**Query Parameters:**
| Param | Type | Required | Description |
|:---|:---|:---|:---|
| `session_id` | string | No | Filter by specific session/work |
| `keyword` | string | No | Full-text search across content + summary |
| `page` | number | No | Page number (default: 1) |
| `pageSize` | number | No | Items per page (default: 20) |

**Response:** Array of `WorkSummary`
```typescript
{
  workId: string;       // session_id
  summary: string;      // AI-generated summary or first user message (truncated 100 chars)
  firstMessageAt: number; // Unix timestamp (ms)
  lastMessageAt: number;  // Unix timestamp (ms)
  messageCount: number;
  tags: string[];       // Aggregated keywords from all messages in this work
}
```

### 3.2 `GET /work/:workId/interacts` — Interacts Under a Work

Query all interacts (exchanges) within a specific work session.

**Path Parameters:**
| Param | Type | Description |
|:---|:---|:---|
| `workId` | string | The work/session ID |

**Response:** Array of `InteractSummary`
```typescript
{
  interactId: string;    // exchange_id
  workId: string;        // parent session_id
  userMessage: string;   // User's message content (truncated 200 chars)
  assistantMessage: string; // Assistant's summary or content (truncated 200 chars)
  summary: string;       // User message summary
  firstMessageAt: number;
  lastMessageAt: number;
  messageCount: number;
  tags: string[];        // Aggregated keywords from this exchange
}
```

### 3.3 `GET /work/tag/:tagId` — Works by Tag

Query all works that contain messages tagged with the given keyword.

**Path Parameters:**
| Param | Type | Description |
|:---|:---|:---|
| `tagId` | string | Tag/keyword to filter by |

**Response:** Array of `WorkSummary` (same structure as `/work/list`)

### 3.4 `GET /interact/keyword` — Interacts by Keyword

Query interacts where message content matches a keyword via FTS5 full-text search.

**Query Parameters:**
| Param | Type | Required | Description |
|:---|:---|:---|:---|
| `q` | string | **Yes** | Search keyword (FTS5 MATCH syntax) |

**Response:** Array of `InteractSummary` (same structure as `/work/:workId/interacts`) with additional `workId` field for cross-module linking.

### 3.5 `GET /keyword-graph` — Keyword Graph Data

Return keyword frequency data for Circle Packing visualization on the Keyword Graph tab.

**Response:** Array of `KeywordNode`
```typescript
{
  id: string;    // keyword text
  name: string;  // keyword text (display label)
  count: number; // activation count (circle size)
  type: string;  // keyword type (currently 'keyword')
}
```

**Data Source:** `user_message_keyword` table, grouped by keyword, ordered by count descending.

### 3.6 `GET /message/detail/:msgId` — Message Detail

Get a single message's full detail by its `msg_id`.

**Path Parameters:**
| Param | Type | Description |
|:---|:---|:---|
| `msgId` | string | The message's msg_id |

**Response:** Full `UserMessage` object with all fields (content, role, metadata, tags, timestamps, etc.) or 404 if not found.

## 4. Service Methods (InformationService)

All new methods are added to `InformationService` in `backend/src/core/information/InformationService.ts`:

| Method | Description |
|:---|:---|
| `getWorks(userId?, filters?)` | Query user_messages grouped by session_id with pagination and keyword/tag filtering |
| `getInteracts(workId)` | Query user_messages grouped by exchange_id within a session |
| `getWorksByTag(tag)` | Find sessions containing messages with the given tag via `user_message_keyword` join |
| `getInteractsByKeyword(keyword)` | Full-text search user_messages_fts then group by exchange_id |
| `getKeywordGraph()` | Aggregate keyword counts from `user_message_keyword` |
| `getMessageDetail(msgId)` | Delegates to existing `getMessageByMsgId()` |

## 5. Cross-Module Linking

The Info Page supports cross-tab navigation via `work_id` and `interact_id` references:

- **Tag Graph → Work List**: Clicking a tag node calls `GET /work/tag/:tagId` to show associated works
- **Keyword Graph → Interact Cards**: Clicking a keyword calls `GET /interact/keyword?q=...` to show matching interacts
- **Message Detail → Context**: Clicking a message calls `GET /message/detail/:msgId` to load full content

## 6. Implementation Notes

- Routes are registered **before** the `/:userId` catch-all in `memoryRoutes.ts` to avoid routing conflicts
- `/work/tag/:tagId` is registered **before** `/work/:workId/interacts` so literal path "tag" doesn't match as a workId
- All endpoints follow the existing try/catch + logger pattern used throughout `memoryRoutes.ts`
- Keyword search uses SQLite FTS5 (`user_messages_fts`) for efficient full-text matching
- Tag filtering uses the `user_message_keyword` join table with `DISTINCT` session_id aggregation
