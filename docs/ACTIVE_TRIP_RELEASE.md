# Current journey behavior

See [README](../README.md) for the production flow and data boundaries.

The initial map remains clean even when a destination is selected. Generic passenger stops appear only in explicit nearby-stops mode, which is cleared when planning starts. Selected journeys show a blue segment and only the ordered boarding, intermediate and alighting stops.

The details footer keeps duration and the start action visible. Starting enters active mode directly; mobile tracking uses a compact bottom panel. GPS advances ordered stops, arrival uses the selected destination, and remaining time includes the final walk. Saved origins and destinations support browser persistence, aliases and deletion.

The browser verifier uses the real planner with a morning departure from the sparse imported calendar and simulated GPS on desktop and mobile. Derived candidates use estimated times internally; unconfirmed passenger-stop membership or direction never becomes a usable itinerary.
