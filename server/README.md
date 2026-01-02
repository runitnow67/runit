# RUNIT Control Plane

This service acts as the control plane for RUNIT.

Responsibilities:
- Accept notebook sessions from providers
- Match renters to providers
- Never proxy notebook traffic

Deployment:
- Designed for Render
- Stateless (in-memory for v1)

Endpoints:
- POST /provider/session
- POST /renter/request
