"""
Tests for URL validator (SSRF prevention).
Covers: domain allowlist, private IP blocking, HTTPS enforcement, edge cases.
"""
import pytest
from unittest.mock import patch
import socket

from app.utils.url_validator import validate_fetch_url, UnsafeURLError, ALLOWED_DOMAINS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_public_dns(hostname, port, **kwargs):
    """Mock DNS that resolves everything to a public IP."""
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port or 443))]


def _mock_private_dns(hostname, port, **kwargs):
    """Mock DNS that resolves to a private IP (10.x)."""
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.1", port or 443))]


def _mock_loopback_dns(hostname, port, **kwargs):
    """Mock DNS that resolves to loopback."""
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port or 443))]


def _mock_link_local_dns(hostname, port, **kwargs):
    """Mock DNS that resolves to link-local (169.254.x.x)."""
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.1.1", port or 443))]


def _mock_dns_fail(hostname, port, **kwargs):
    """Mock DNS resolution failure."""
    raise socket.gaierror("Name or service not known")


# ---------------------------------------------------------------------------
# Domain Allowlist
# ---------------------------------------------------------------------------

class TestDomainAllowlist:
    """Allowed domains pass, non-allowed domains are blocked."""

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_allowed_domain_passes(self, _):
        result = validate_fetch_url("https://boards.greenhouse.io/company/jobs/123")
        assert result == "https://boards.greenhouse.io/company/jobs/123"

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_multiple_allowed_domains(self, _):
        for domain in ("www.linkedin.com", "jobs.lever.co", "wellfound.com", "storage.googleapis.com"):
            result = validate_fetch_url(f"https://{domain}/path")
            assert domain in result

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_non_allowed_domain_blocked(self, _):
        with pytest.raises(UnsafeURLError, match="not in allowlist"):
            validate_fetch_url("https://evil.com/steal-data")

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_subdomain_of_allowed_domain_passes(self, _):
        """sub.boards.greenhouse.io should match boards.greenhouse.io."""
        result = validate_fetch_url("https://sub.boards.greenhouse.io/jobs")
        assert "sub.boards.greenhouse.io" in result

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_similar_but_different_domain_blocked(self, _):
        """evilgreenhouse.io should NOT match greenhouse.io."""
        with pytest.raises(UnsafeURLError, match="not in allowlist"):
            validate_fetch_url("https://evilgreenhouse.io/jobs")

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_extra_domains_parameter(self, _):
        """extra_domains adds to the allowlist for that call."""
        # Without extra_domains - blocked
        with pytest.raises(UnsafeURLError, match="not in allowlist"):
            validate_fetch_url("https://custom-board.example.com/jobs")

        # With extra_domains - allowed
        result = validate_fetch_url(
            "https://custom-board.example.com/jobs",
            extra_domains={"custom-board.example.com"},
        )
        assert "custom-board.example.com" in result

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_extra_domains_does_not_mutate_global(self, _):
        """extra_domains should not modify the global ALLOWED_DOMAINS set."""
        original_size = len(ALLOWED_DOMAINS)
        validate_fetch_url(
            "https://temp-domain.test/path",
            extra_domains={"temp-domain.test"},
        )
        assert len(ALLOWED_DOMAINS) == original_size

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_hostname_case_insensitive(self, _):
        result = validate_fetch_url("https://WWW.LINKEDIN.COM/in/someone")
        assert result == "https://WWW.LINKEDIN.COM/in/someone"


# ---------------------------------------------------------------------------
# Private IP Blocking
# ---------------------------------------------------------------------------

class TestPrivateIPBlocking:
    """DNS resolving to private/internal IPs must be blocked."""

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_private_dns)
    def test_private_ip_10_x_blocked(self, _):
        with pytest.raises(UnsafeURLError, match="private/internal"):
            validate_fetch_url("https://boards.greenhouse.io/jobs")

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_loopback_dns)
    def test_loopback_blocked(self, _):
        with pytest.raises(UnsafeURLError, match="private/internal"):
            validate_fetch_url("https://boards.greenhouse.io/jobs")

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_link_local_dns)
    def test_link_local_blocked(self, _):
        with pytest.raises(UnsafeURLError, match="private/internal"):
            validate_fetch_url("https://boards.greenhouse.io/jobs")

    @patch("app.utils.url_validator.socket.getaddrinfo")
    def test_reserved_ip_blocked(self, mock_dns):
        """192.168.x.x is private, should be blocked."""
        mock_dns.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.1.1", 443))]
        with pytest.raises(UnsafeURLError, match="private/internal"):
            validate_fetch_url("https://boards.greenhouse.io/jobs")

    @patch("app.utils.url_validator.socket.getaddrinfo")
    def test_172_16_private_blocked(self, mock_dns):
        mock_dns.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("172.16.0.1", 443))]
        with pytest.raises(UnsafeURLError, match="private/internal"):
            validate_fetch_url("https://boards.greenhouse.io/jobs")

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_dns_fail)
    def test_dns_resolution_failure(self, _):
        with pytest.raises(UnsafeURLError, match="DNS resolution failed"):
            validate_fetch_url("https://boards.greenhouse.io/jobs")


# ---------------------------------------------------------------------------
# HTTPS Enforcement
# ---------------------------------------------------------------------------

class TestHTTPSEnforcement:
    """Only HTTPS allowed, except HTTP for localhost."""

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_https_allowed(self, _):
        result = validate_fetch_url("https://boards.greenhouse.io/jobs")
        assert result.startswith("https://")

    def test_http_non_localhost_blocked(self):
        with pytest.raises(UnsafeURLError, match="HTTP only allowed for localhost"):
            validate_fetch_url("http://boards.greenhouse.io/jobs")

    def test_http_localhost_scheme_passes_but_ip_blocks(self):
        """HTTP localhost passes scheme check but loopback IP is still blocked."""
        with pytest.raises(UnsafeURLError, match="private/internal"):
            validate_fetch_url("http://localhost:5001/api/test")

    def test_http_127_0_0_1_scheme_passes_but_ip_blocks(self):
        """HTTP 127.0.0.1 passes scheme check but loopback IP is still blocked."""
        with pytest.raises(UnsafeURLError, match="private/internal"):
            validate_fetch_url("http://127.0.0.1:5001/api/test")

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_http_localhost_with_public_dns_passes_scheme(self, _):
        """If localhost somehow resolved to public IP, scheme check still passes."""
        # But it would fail the domain allowlist check
        with pytest.raises(UnsafeURLError, match="not in allowlist"):
            validate_fetch_url("http://localhost:5001/api/test")

    def test_ftp_scheme_blocked(self):
        with pytest.raises(UnsafeURLError, match="Blocked scheme"):
            validate_fetch_url("ftp://boards.greenhouse.io/file")

    def test_file_scheme_blocked(self):
        with pytest.raises(UnsafeURLError, match="Blocked scheme"):
            validate_fetch_url("file:///etc/passwd")

    def test_javascript_scheme_blocked(self):
        with pytest.raises(UnsafeURLError, match="Blocked scheme"):
            validate_fetch_url("javascript:alert(1)")

    def test_data_scheme_blocked(self):
        with pytest.raises(UnsafeURLError, match="Blocked scheme"):
            validate_fetch_url("data:text/html,<h1>hi</h1>")


# ---------------------------------------------------------------------------
# Edge Cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    """Empty URLs, None, whitespace, missing hostname, etc."""

    def test_empty_string(self):
        with pytest.raises(UnsafeURLError, match="Empty or invalid"):
            validate_fetch_url("")

    def test_none_url(self):
        with pytest.raises(UnsafeURLError, match="Empty or invalid"):
            validate_fetch_url(None)

    def test_non_string_url(self):
        with pytest.raises(UnsafeURLError, match="Empty or invalid"):
            validate_fetch_url(12345)

    def test_whitespace_only(self):
        with pytest.raises(UnsafeURLError):
            validate_fetch_url("   ")

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_url_with_leading_trailing_whitespace_stripped(self, _):
        result = validate_fetch_url("  https://boards.greenhouse.io/jobs  ")
        assert result == "https://boards.greenhouse.io/jobs"

    def test_url_without_hostname(self):
        with pytest.raises(UnsafeURLError):
            validate_fetch_url("https://")

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_url_with_port(self, _):
        result = validate_fetch_url("https://boards.greenhouse.io:8443/jobs")
        assert ":8443" in result

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_url_with_query_and_fragment(self, _):
        url = "https://boards.greenhouse.io/jobs?id=123#apply"
        result = validate_fetch_url(url)
        assert result == url

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_url_with_path_traversal(self, _):
        """Path traversal in URL should still work if domain is allowed."""
        result = validate_fetch_url("https://boards.greenhouse.io/../../../etc/passwd")
        assert "boards.greenhouse.io" in result

    def test_unsafe_url_error_is_exception(self):
        assert issubclass(UnsafeURLError, Exception)

    @patch("app.utils.url_validator.socket.getaddrinfo")
    def test_multiple_dns_results_all_checked(self, mock_dns):
        """If DNS returns multiple IPs, ALL must be public."""
        mock_dns.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.1", 443)),  # private
        ]
        with pytest.raises(UnsafeURLError, match="private/internal"):
            validate_fetch_url("https://boards.greenhouse.io/jobs")

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_allowed_domains_set_is_nonempty(self, _):
        assert len(ALLOWED_DOMAINS) > 0

    @patch("app.utils.url_validator.socket.getaddrinfo", side_effect=_mock_public_dns)
    def test_google_storage_domains_allowed(self, _):
        """Firebase/GCS resume URLs must pass."""
        for domain in ("storage.googleapis.com", "firebasestorage.googleapis.com"):
            result = validate_fetch_url(f"https://{domain}/v0/b/bucket/o/file.pdf")
            assert domain in result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
