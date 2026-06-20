# NTFY summary formatting update

This update only changes the local NINA agent notification formatting.

Changes:

- removes the middle-dot character from the ntfy title to avoid `�` rendering on some devices;
- formats mosaic panels as `Target / P2 / Filter` instead of `Target P2 / Filter`;
- formats target summaries as `Target / P2` when applicable;
- keeps HFR as median ± sample standard deviation by target/panel/filter.

No Neon migration is required.
No Vercel redeploy is required unless you want GitHub to keep the updated agent script.

On the remote PC, replace:

```text
C:\DSO\nina_agent\nina_sync_agent.py
```

then restart the scheduled task or the agent.
