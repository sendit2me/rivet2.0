#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeRuntimeDecision {
    pub supported: bool,
    pub reason: Option<String>,
}

pub fn unavailable_decision() -> NativeRuntimeDecision {
    NativeRuntimeDecision {
        supported: false,
        reason: Some(
            "native runtime execution is not enabled until benchmark gates pass".to_string(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unavailable_decision_is_explicit() {
        let decision = unavailable_decision();

        assert!(!decision.supported);
        assert_eq!(
            decision.reason.as_deref(),
            Some("native runtime execution is not enabled until benchmark gates pass")
        );
    }
}
