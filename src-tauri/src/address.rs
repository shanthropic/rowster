use url::Url;

use crate::error::{Error, Result};

/// Parses user-typed address-bar input into a navigable URL.
///
/// Heuristics, mirroring mainstream browsers:
/// - Input already containing a supported scheme (`https://…`) is parsed as-is.
/// - `example.com`, `example.com/path`, `example.com:8080/x` are promoted to
///   `https://…` (falling back to `http://…` when https fails to parse).
/// - `localhost[:port]` and IP literals are promoted to `http://…`.
/// - Anything that does not look like a host (contains spaces, no dot, not
///   localhost) is rejected. The caller may choose to interpret it as a
///   search query instead.
///
/// The result still goes through [`crate::security::nav_policy::validate`]
/// before any navigation is allowed to start.
pub struct Address;

impl Address {
    pub fn parse(input: &str) -> Result<Url> {
        let raw = input.trim();
        if raw.is_empty() {
            return Err(Error::InvalidAddress("empty address".to_string()));
        }

        if let Ok(url) = Url::parse(raw)
            && Self::has_scheme(&url)
        {
            return Ok(url);
        }

        let host_part = raw.split(['/', '?', '#']).next().unwrap_or(raw);
        let looks_like_host = Self::looks_like_host(host_part);
        if !looks_like_host {
            return Err(Error::InvalidAddress(format!(
                "`{raw}` is not a valid address"
            )));
        }

        let is_http_host = host_part.eq_ignore_ascii_case("localhost")
            || host_part.starts_with("localhost:")
            || Self::is_ip_literal(host_part);

        let promoted = if is_http_host {
            format!("http://{raw}")
        } else {
            format!("https://{raw}")
        };
        if let Ok(url) = Url::parse(&promoted)
            && url.host_str().is_some()
        {
            return Ok(url);
        }

        if !is_http_host
            && let Ok(url) = Url::parse(&format!("http://{raw}"))
            && url.host_str().is_some()
        {
            return Ok(url);
        }

        Err(Error::InvalidAddress(format!(
            "`{raw}` is not a valid address"
        )))
    }

    fn has_scheme(url: &Url) -> bool {
        // `localhost:8080` parses as scheme `localhost`, so only treat
        // known schemes as real schemes here; everything else falls through
        // to host promotion.
        matches!(url.scheme(), "http" | "https" | "about")
    }

    fn is_ip_literal(host: &str) -> bool {
        let addr = host.split(':').next().unwrap_or(host);
        addr.parse::<std::net::IpAddr>().is_ok()
    }

    fn looks_like_host(host: &str) -> bool {
        if host.is_empty() || host.contains(char::is_whitespace) {
            return false;
        }
        if host.eq_ignore_ascii_case("localhost") || host.starts_with("localhost:") {
            return true;
        }
        if Self::is_ip_literal(host) {
            return true;
        }
        // hostname: requires at least one dot and a tld-ish tail
        host.contains('.') && host.ends_with(|c: char| c.is_ascii_alphanumeric())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_schemeless_hostname_as_https() {
        assert_eq!(
            Address::parse("example.com").unwrap().as_str(),
            "https://example.com/"
        );
        assert_eq!(
            Address::parse("example.com/path").unwrap().as_str(),
            "https://example.com/path"
        );
        assert_eq!(
            Address::parse("www.example.com:8080/x").unwrap().as_str(),
            "https://www.example.com:8080/x"
        );
    }

    #[test]
    fn parses_localhost_and_ips_as_http() {
        assert_eq!(
            Address::parse("localhost:3000").unwrap().as_str(),
            "http://localhost:3000/"
        );
        assert_eq!(
            Address::parse("127.0.0.1:8080").unwrap().as_str(),
            "http://127.0.0.1:8080/"
        );
        assert_eq!(
            Address::parse("192.168.1.10").unwrap().as_str(),
            "http://192.168.1.10/"
        );
    }

    #[test]
    fn passes_through_explicit_schemes() {
        assert_eq!(
            Address::parse("https://example.com").unwrap().as_str(),
            "https://example.com/"
        );
        assert_eq!(
            Address::parse("http://localhost:3000/x").unwrap().as_str(),
            "http://localhost:3000/x"
        );
        assert_eq!(
            Address::parse("about:blank").unwrap().as_str(),
            "about:blank"
        );
    }

    #[test]
    fn rejects_garbage() {
        for bad in [
            "",
            "   ",
            "hello world",
            "not a host",
            "C:\\Users\\foo",
            "ht tp://x",
        ] {
            assert!(Address::parse(bad).is_err(), "expected `{bad}` to fail");
        }
    }

    #[test]
    fn trims_whitespace() {
        assert_eq!(
            Address::parse("  example.com  ").unwrap().as_str(),
            "https://example.com/"
        );
    }
}
