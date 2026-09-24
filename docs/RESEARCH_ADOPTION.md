# Research adoption decisions

WVM is deterministic catalog/editor/rendering software. Generic AI-platform research does not justify adding model, agent, RAG, or observability infrastructure to V1. Decisions below are WVM-specific and can be revisited only when the stated trigger exists.

| Technology/project | Research finding | WVM decision | Reason | Revisit trigger | Source |
|---|---|---|---|---|---|
| Stable domain boundaries and adapters | Keep business capabilities platform-independent. | Adopt now | Prevents SharePoint, MCP, UI, and renderer lock-in. | A concrete integration is approved. | Internal architecture decision |
| Dependency/licence inventory | Track dependency provenance and terms early. | Adopt now | Public repo needs a clear supply-chain record. | Review on each dependency change. | Internal security policy |
| OpenAI Apps SDK examples | Useful patterns for a later ChatGPT surface. | Reference | Not part of desktop V1. | Approved external agent capability. | https://github.com/openai/openai-apps-sdk-examples |
| MCP | Potential external capability protocol. | Reference | Adapter over application services only; not internal architecture. | A supported agent host use case is approved. | https://modelcontextprotocol.io/ |
| Superpowers planning/TDD/review | Small tasks and failing-test-first workflow. | Adopt now | Suits geometry, persistence, and renderer risk. | Continue during implementation. | https://github.com/obra/superpowers |
| Vercel AI SDK | Chat/streaming UI toolkit. | Reject for V1 | No model interaction or chat surface. | A specified AI feature needs a web UI. | https://github.com/vercel/ai |
| OpenAI Agents SDK | Agent runtime and tools. | Defer | V1 actions are deterministic and local. | Approved agent workflow with acceptance criteria. | https://github.com/openai/openai-agents-python |
| LangGraph | Stateful agent orchestration. | Defer | Adds runtime complexity without a V1 workflow. | A real multi-step agent requirement exists. | https://github.com/langchain-ai/langgraph |
| Microsoft Agent Framework | Agent orchestration/tooling. | Defer | No V1 agent requirement. | Approved Microsoft agent deployment requirement. | https://github.com/microsoft/agent-framework |
| LiteLLM | Model provider routing/gateway. | Defer | No model providers in V1. | Multiple approved model providers are required. | https://github.com/BerriAI/litellm |
| pgvector/Qdrant | Vector retrieval. | Reject for V1 | Structured catalog search uses SQLite indexes; no semantic retrieval need. | Measured user requirement cannot be met by deterministic search. | https://github.com/pgvector/pgvector ; https://github.com/qdrant/qdrant |
| RAG frameworks | Retrieval orchestration for document corpora. | Reject for V1 | Warehouse visuals are structured records and versioned layouts. | A separately approved document assistant is scoped. | https://github.com/deepset-ai/haystack ; https://github.com/run-llama/llama_index |
| Ollama/vLLM/SGLang | Local/model serving stacks. | Reject for V1 | No inference requirement. | Approved model feature with deployment decision. | https://github.com/ollama/ollama ; https://github.com/vllm-project/vllm ; https://github.com/sgl-project/sglang |
| Langfuse/Phoenix/OpenLLMetry | AI tracing and observability. | Reject for V1 | No AI runtime; local application logs/audit are sufficient. | An approved AI feature needs tracing. | https://github.com/langfuse/langfuse ; https://github.com/Arize-ai/phoenix ; https://github.com/traceloop/openllmetry |
| Promptfoo | LLM evaluation. | Defer | No prompt/runtime model behavior to evaluate. | AI behavior is approved and implemented. | https://github.com/promptfoo/promptfoo |
| LibreChat/Open WebUI/Dify/AnythingLLM/RAGFlow | Full chat/AI workspaces. | Reference | Do not fork an unrelated product; reuse only small patterns that directly meet a WVM need. | No default reconsideration; must show direct fit. | https://github.com/danny-avila/LibreChat ; https://github.com/open-webui/open-webui ; https://github.com/langgenius/dify ; https://github.com/Mintplex-Labs/anything-llm ; https://github.com/infiniflow/ragflow |
| PostgreSQL / pgvector | Shared database and vector search options. | Reject for V1 | Local SQLite is the chosen single-user system of record. | A separately approved shared service deployment. | https://www.postgresql.org/ ; https://github.com/pgvector/pgvector |
| SharePoint / Microsoft Graph | Possible future shared metadata/assets integration. | Defer | Not V1 persistence; use approved API/workflow adapter later. | Shared catalog is explicitly funded and specified. | https://learn.microsoft.com/graph/ |

No technology in this table creates permission to add an integration. Any future adapter needs an approved requirement, security review, and ADR or spec update.
