from rest_framework.authentication import SessionAuthentication


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """Session auth without CSRF enforcement.

    DRF's default SessionAuthentication checks CSRF on every state-changing
    request. Since the Next.js frontend communicates cross-origin (different
    port in dev, different subdomain in prod) and we gate access via
    CORS_ALLOWED_ORIGINS + CORS_ALLOW_CREDENTIALS, the redundant CSRF check
    just causes 403s. This class skips it while keeping session-based identity.
    """

    def enforce_csrf(self, request):
        pass
