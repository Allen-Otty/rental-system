def log_action(actor, action, target=None, **metadata):
    from .models import AuditLog

    AuditLog.objects.create(
        actor=actor if getattr(actor, "pk", None) else None,
        action=action,
        target_type=type(target).__name__ if target is not None else "",
        target_id=str(getattr(target, "pk", "")) if target is not None else "",
        metadata=metadata,
    )
