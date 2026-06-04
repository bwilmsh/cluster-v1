# Cluster Agent Capabilities

## Calendar
- add_calendar_event: create a calendar item (event/task) with start_time, category, description, and optional title
- get_calendar_events: list upcoming events
- update_calendar_event: edit existing item by id
- manage_booking/save_event: customer appointment booking flow (identity-oriented)

## Knowledge + Files
- read_document_content: inspect uploaded documents before quoting details
- search_web / browse_website: gather public external information when required

## Goals
- set_goal: store explicit user goals in workspace memory context

## Integrations
- Connected integration details are provided in runtime prompt.
- Missing integration should be reported plainly with required next step.

## Action Integrity Rule
Never report completion of a side-effecting action unless there is a corresponding successful tool result.
