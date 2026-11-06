- The person on call answers alerts from 08:00 to 20:00
- Handover is on Thursday at noon, in the standup
- Runbook
	- Check the queue worker first
	  ```sh
	  systemctl status queue-worker
	  journalctl -u queue-worker --since "10 min ago"
	  ```
	- Then the database connections
