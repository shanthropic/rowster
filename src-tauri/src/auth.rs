use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use argon2::{Algorithm, Argon2, Params, Version};
use password_hash::rand_core::OsRng;
use password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use crate::error::{Error, Result, lock};

const AUTH_FILE: &str = "auth.json";
const AUTH_VERSION: u32 = 1;
const MIN_PASSWORD_CHARS: usize = 8;
const MAX_PASSWORD_CHARS: usize = 1024;
const MAX_NAME_CHARS: usize = 80;

#[derive(Debug, Clone, Serialize)]
pub struct AuthStatus {
    pub phase: AuthPhase,
    pub name: Option<String>,
    pub password_configured: bool,
    pub passkey_configured: bool,
    pub passkey_available: bool,
    pub retry_after_ms: u64,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthPhase {
    Onboarding,
    Locked,
    Unlocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AuthProfile {
    version: u32,
    name: String,
    password_hash: Option<String>,
    #[serde(default)]
    passkey_enabled: bool,
}

struct AuthInner {
    profile: Option<AuthProfile>,
    unlocked: bool,
    failed_attempts: u32,
    retry_at: Option<Instant>,
}

#[derive(Clone)]
pub struct AuthManager {
    inner: Arc<Mutex<AuthInner>>,
    path: Option<PathBuf>,
}

impl Default for AuthManager {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(AuthInner {
                profile: None,
                unlocked: false,
                failed_attempts: 0,
                retry_at: None,
            })),
            path: None,
        }
    }
}

impl AuthManager {
    pub fn load(data_dir: &Path) -> Result<Self> {
        let path = data_dir.join(AUTH_FILE);
        let profile = if path.exists() {
            let raw = std::fs::read(&path)?;
            let profile: AuthProfile = serde_json::from_slice(&raw)?;
            validate_profile(&profile)?;
            Some(profile)
        } else {
            None
        };
        let unlocked = profile
            .as_ref()
            .is_some_and(|profile| profile.password_hash.is_none());
        Ok(Self {
            inner: Arc::new(Mutex::new(AuthInner {
                profile,
                unlocked,
                failed_attempts: 0,
                retry_at: None,
            })),
            path: Some(path),
        })
    }

    pub fn status(&self) -> Result<AuthStatus> {
        let inner = lock(&self.inner)?;
        let phase = match (&inner.profile, inner.unlocked) {
            (None, _) => AuthPhase::Onboarding,
            (Some(_), true) => AuthPhase::Unlocked,
            (Some(_), false) => AuthPhase::Locked,
        };
        let retry_after_ms = inner
            .retry_at
            .and_then(|retry_at| retry_at.checked_duration_since(Instant::now()))
            .map(|duration| duration.as_millis().try_into().unwrap_or(u64::MAX))
            .unwrap_or(0);
        Ok(AuthStatus {
            phase,
            name: inner.profile.as_ref().map(|profile| profile.name.clone()),
            password_configured: inner
                .profile
                .as_ref()
                .is_some_and(|profile| profile.password_hash.is_some()),
            passkey_configured: inner
                .profile
                .as_ref()
                .is_some_and(|profile| profile.passkey_enabled),
            passkey_available: native::is_available(),
            retry_after_ms,
        })
    }

    pub fn is_unlocked(&self) -> bool {
        lock(&self.inner).is_ok_and(|inner| inner.unlocked)
    }

    pub fn require_unlocked(&self) -> Result<()> {
        let inner = lock(&self.inner)?;
        if inner.profile.is_none() {
            return Err(Error::OnboardingRequired);
        }
        if !inner.unlocked {
            return Err(Error::AuthenticationRequired);
        }
        Ok(())
    }

    pub fn complete_onboarding(
        &self,
        name: &str,
        password: Option<&str>,
        passkey_enabled: bool,
    ) -> Result<()> {
        let name = validate_name(name)?;
        if passkey_enabled && password.is_none() {
            return Err(Error::Other(
                "a passkey requires a password recovery method".into(),
            ));
        }
        if passkey_enabled {
            native::verify("Set up device sign-in for Rowster")?;
        }
        let password_hash = password.map(hash_password).transpose()?;
        let profile = AuthProfile {
            version: AUTH_VERSION,
            name,
            password_hash,
            passkey_enabled,
        };
        let mut inner = lock(&self.inner)?;
        if inner.profile.is_some() {
            return Err(Error::Other("onboarding is already complete".into()));
        }
        self.save(&profile)?;
        inner.profile = Some(profile);
        inner.unlocked = true;
        reset_failures(&mut inner);
        Ok(())
    }

    pub fn unlock_with_password(&self, password: &str) -> Result<()> {
        let mut inner = lock(&self.inner)?;
        enforce_rate_limit(&inner)?;
        let hash = inner
            .profile
            .as_ref()
            .and_then(|profile| profile.password_hash.as_deref())
            .ok_or(Error::AuthenticationFailed)?;
        if !verify_password(password, hash) {
            record_failure(&mut inner);
            return Err(Error::AuthenticationFailed);
        }
        inner.unlocked = true;
        reset_failures(&mut inner);
        Ok(())
    }

    pub fn unlock_with_passkey(&self) -> Result<()> {
        {
            let inner = lock(&self.inner)?;
            enforce_rate_limit(&inner)?;
            if !inner
                .profile
                .as_ref()
                .is_some_and(|profile| profile.passkey_enabled)
            {
                return Err(Error::AuthenticationFailed);
            }
        }
        native::verify("Unlock Rowster")?;
        let mut inner = lock(&self.inner)?;
        inner.unlocked = true;
        reset_failures(&mut inner);
        Ok(())
    }

    pub fn set_password(&self, current_password: Option<&str>, new_password: &str) -> Result<()> {
        self.require_unlocked()?;
        validate_password(new_password)?;
        let mut inner = lock(&self.inner)?;
        verify_current_password(&mut inner, current_password)?;
        let mut profile = inner.profile.clone().ok_or(Error::OnboardingRequired)?;
        profile.password_hash = Some(hash_password(new_password)?);
        self.save(&profile)?;
        inner.profile = Some(profile);
        reset_failures(&mut inner);
        Ok(())
    }

    pub fn remove_password(&self, current_password: &str) -> Result<()> {
        self.require_unlocked()?;
        let mut inner = lock(&self.inner)?;
        verify_current_password(&mut inner, Some(current_password))?;
        let mut profile = inner.profile.clone().ok_or(Error::OnboardingRequired)?;
        profile.password_hash = None;
        profile.passkey_enabled = false;
        self.save(&profile)?;
        inner.profile = Some(profile);
        reset_failures(&mut inner);
        Ok(())
    }

    pub fn set_passkey(&self, enabled: bool, current_password: &str) -> Result<()> {
        self.require_unlocked()?;
        {
            let mut inner = lock(&self.inner)?;
            verify_current_password(&mut inner, Some(current_password))?;
            if inner
                .profile
                .as_ref()
                .is_none_or(|profile| profile.password_hash.is_none())
            {
                return Err(Error::Other(
                    "create a password before configuring a passkey".into(),
                ));
            }
        }
        if enabled {
            native::verify("Set up device sign-in for Rowster")?;
        }
        let mut inner = lock(&self.inner)?;
        let mut profile = inner.profile.clone().ok_or(Error::OnboardingRequired)?;
        if enabled && profile.password_hash.is_none() {
            return Err(Error::Other(
                "create a password before configuring a passkey".into(),
            ));
        }
        profile.passkey_enabled = enabled;
        self.save(&profile)?;
        inner.profile = Some(profile);
        reset_failures(&mut inner);
        Ok(())
    }

    pub fn update_name(&self, name: &str) -> Result<()> {
        self.require_unlocked()?;
        let mut inner = lock(&self.inner)?;
        let mut profile = inner.profile.clone().ok_or(Error::OnboardingRequired)?;
        profile.name = validate_name(name)?;
        self.save(&profile)?;
        inner.profile = Some(profile);
        Ok(())
    }

    fn save(&self, profile: &AuthProfile) -> Result<()> {
        let Some(path) = self.path.as_ref() else {
            return Ok(());
        };
        let tmp = path.with_extension("json.tmp");
        let bytes = serde_json::to_vec_pretty(profile)?;
        let mut file = std::fs::File::create(&tmp)?;
        std::io::Write::write_all(&mut file, &bytes)?;
        file.sync_all()?;
        set_private_permissions(&tmp)?;
        replace_file(&tmp, path)?;
        Ok(())
    }
}

fn validate_profile(profile: &AuthProfile) -> Result<()> {
    if profile.version != AUTH_VERSION {
        return Err(Error::Other(format!(
            "unsupported authentication profile version {}",
            profile.version
        )));
    }
    validate_name(&profile.name)?;
    if let Some(hash) = profile.password_hash.as_deref() {
        PasswordHash::new(hash)
            .map_err(|_| Error::Other("stored authentication profile is invalid".into()))?;
    } else if profile.passkey_enabled {
        return Err(Error::Other(
            "stored passkey has no password recovery method".into(),
        ));
    }
    Ok(())
}

fn validate_name(name: &str) -> Result<String> {
    let name = name.trim();
    let count = name.chars().count();
    if count == 0 || count > MAX_NAME_CHARS || name.chars().any(char::is_control) {
        return Err(Error::Other(
            "name must be between 1 and 80 printable characters".into(),
        ));
    }
    Ok(name.to_string())
}

fn validate_password(password: &str) -> Result<()> {
    let count = password.chars().count();
    if !(MIN_PASSWORD_CHARS..=MAX_PASSWORD_CHARS).contains(&count) {
        return Err(Error::Other(
            "password must be between 8 and 1024 characters".into(),
        ));
    }
    Ok(())
}

fn argon2() -> Result<Argon2<'static>> {
    let params = Params::new(19_456, 2, 1, None)
        .map_err(|error| Error::Other(format!("invalid password hash parameters: {error}")))?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

fn hash_password(password: &str) -> Result<String> {
    validate_password(password)?;
    let password = Zeroizing::new(password.as_bytes().to_vec());
    let salt = SaltString::generate(&mut OsRng);
    argon2()?
        .hash_password(&password, &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| Error::Other(format!("password hashing failed: {error}")))
}

fn verify_password(password: &str, encoded: &str) -> bool {
    let Ok(hash) = PasswordHash::new(encoded) else {
        return false;
    };
    let password = Zeroizing::new(password.as_bytes().to_vec());
    argon2()
        .and_then(|argon2| {
            argon2
                .verify_password(&password, &hash)
                .map_err(|_| Error::AuthenticationFailed)
        })
        .is_ok()
}

fn verify_current_password(inner: &mut AuthInner, current_password: Option<&str>) -> Result<()> {
    enforce_rate_limit(inner)?;
    let Some(hash) = inner
        .profile
        .as_ref()
        .and_then(|profile| profile.password_hash.as_deref())
    else {
        return Ok(());
    };
    if current_password.is_none_or(|password| !verify_password(password, hash)) {
        record_failure(inner);
        return Err(Error::AuthenticationFailed);
    }
    Ok(())
}

fn enforce_rate_limit(inner: &AuthInner) -> Result<()> {
    if inner
        .retry_at
        .is_some_and(|retry_at| retry_at > Instant::now())
    {
        return Err(Error::AuthenticationFailed);
    }
    Ok(())
}

fn record_failure(inner: &mut AuthInner) {
    inner.failed_attempts = inner.failed_attempts.saturating_add(1);
    let exponent = inner.failed_attempts.saturating_sub(1).min(5);
    inner.retry_at = Some(Instant::now() + Duration::from_secs(1_u64 << exponent));
}

fn reset_failures(inner: &mut AuthInner) {
    inner.failed_attempts = 0;
    inner.retry_at = None;
}

#[cfg(unix)]
fn set_private_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn replace_file(source: &Path, target: &Path) -> Result<()> {
    std::fs::rename(source, target)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn replace_file(source: &Path, target: &Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };
    use windows::core::PCWSTR;

    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        MoveFileExW(
            PCWSTR(source.as_ptr()),
            PCWSTR(target.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(|error| Error::Other(format!("could not persist authentication profile: {error}")))
}

#[cfg(target_os = "windows")]
mod native {
    use windows::Security::Credentials::UI::{
        UserConsentVerificationResult, UserConsentVerifier, UserConsentVerifierAvailability,
    };
    use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize};
    use windows::core::HSTRING;

    use crate::error::{Error, Result};

    struct WinRtApartment;

    impl WinRtApartment {
        fn initialize() -> Result<Self> {
            unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
                .map_err(|error| Error::Other(format!("Windows Hello unavailable: {error}")))?;
            Ok(Self)
        }
    }

    impl Drop for WinRtApartment {
        fn drop(&mut self) {
            unsafe { RoUninitialize() };
        }
    }

    pub fn is_available() -> bool {
        let Ok(_apartment) = WinRtApartment::initialize() else {
            return false;
        };
        UserConsentVerifier::CheckAvailabilityAsync()
            .and_then(|operation| operation.get())
            .is_ok_and(|availability| availability == UserConsentVerifierAvailability::Available)
    }

    pub fn verify(reason: &str) -> Result<()> {
        let _apartment = WinRtApartment::initialize()?;
        let result = UserConsentVerifier::RequestVerificationAsync(&HSTRING::from(reason))
            .and_then(|operation| operation.get())
            .map_err(|error| Error::Other(format!("Windows Hello failed: {error}")))?;
        if result == UserConsentVerificationResult::Verified {
            Ok(())
        } else {
            Err(Error::AuthenticationFailed)
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod native {
    use crate::error::{Error, Result};

    pub fn is_available() -> bool {
        false
    }

    pub fn verify(_reason: &str) -> Result<()> {
        Err(Error::Other(
            "native device authentication is unavailable on this platform".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manager() -> AuthManager {
        AuthManager::default()
    }

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "rowster-auth-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn onboarding_without_password_unlocks_profile() {
        let auth = manager();
        auth.complete_onboarding("Ada", None, false).unwrap();
        assert!(auth.require_unlocked().is_ok());
    }

    #[test]
    fn passkey_requires_password() {
        let auth = manager();
        assert!(auth.complete_onboarding("Ada", None, true).is_err());
    }

    #[test]
    fn password_roundtrip_unlocks() {
        let auth = manager();
        auth.complete_onboarding("Ada", Some("correct horse"), false)
            .unwrap();
        lock(&auth.inner).unwrap().unlocked = false;
        auth.unlock_with_password("correct horse").unwrap();
        assert!(auth.is_unlocked());
    }

    #[test]
    fn wrong_password_is_rejected_and_rate_limited() {
        let auth = manager();
        auth.complete_onboarding("Ada", Some("correct horse"), false)
            .unwrap();
        lock(&auth.inner).unwrap().unlocked = false;
        assert!(auth.unlock_with_password("wrong password").is_err());
        assert!(auth.unlock_with_password("correct horse").is_err());
    }

    #[test]
    fn invalid_auth_profile_fails_closed() {
        let profile = AuthProfile {
            version: AUTH_VERSION,
            name: "Ada".into(),
            password_hash: None,
            passkey_enabled: true,
        };
        assert!(validate_profile(&profile).is_err());
    }

    #[test]
    fn persisted_password_profile_reloads_locked() {
        let dir = temp_dir();
        let auth = AuthManager::load(&dir).unwrap();
        auth.complete_onboarding("Ada", Some("correct horse"), false)
            .unwrap();

        let reloaded = AuthManager::load(&dir).unwrap();
        assert_eq!(reloaded.status().unwrap().phase, AuthPhase::Locked);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn corrupt_profile_does_not_fall_back_to_onboarding() {
        let dir = temp_dir();
        std::fs::write(dir.join(AUTH_FILE), b"not json").unwrap();
        assert!(AuthManager::load(&dir).is_err());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn profile_updates_replace_existing_file() {
        let dir = temp_dir();
        let auth = AuthManager::load(&dir).unwrap();
        auth.complete_onboarding("Ada", None, false).unwrap();
        auth.update_name("Grace").unwrap();

        let reloaded = AuthManager::load(&dir).unwrap();
        assert_eq!(reloaded.status().unwrap().name.as_deref(), Some("Grace"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
