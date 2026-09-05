/* Retrieval barrel. The HTTP layer and, from Phase E, the assistant engine
 * consume the service through this module and never reach into its internals. */

export { createRetrievalService } from './service.ts'
export type {
  CreateRetrievalServiceOptions,
  RetrievalRequest,
  RetrievalResult,
  RetrievalService,
} from './service.ts'

export { normalizeQuery, queryTerms, stem } from './normalize.ts'
export type { NormalizedQuery, QueryContext } from './normalize.ts'

export { explainScore, indexTool, scoreAll, scoreTool } from './score.ts'
export type { ScoredTool, ScoreSignals, ToolIndex } from './score.ts'

export { selectCandidates } from './select.ts'
export type { Selection, StageCoverage } from './select.ts'
