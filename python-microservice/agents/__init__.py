# AgenticIQ — Agents package v2.0 (CrewAI + rule-based fallback)
# Rule-based agents are used as:
#   1. Standalone fallback when CrewAI LLM is unavailable
#   2. Data providers for CrewAI agents (structured analysis)
from . import observer_agent, analyst_agent, simulation_agent, decision_agent

__all__ = [
    "observer_agent",
    "analyst_agent",
    "simulation_agent",
    "decision_agent",
    "crew_pipeline",
]