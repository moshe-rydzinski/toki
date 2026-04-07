# Supabase Auth Email Templates

Use these templates to match Toki's love-and-relationship brand style.

## Confirm Signup Template

1. Open Supabase Dashboard for your project.
2. Go to `Authentication` -> `Email Templates`.
3. Select the **Confirm signup** template.
4. Set the subject to: `Confirm your Toki account`.
5. Paste the contents of `supabase/email-templates/confirm-signup.html` into the HTML editor.
6. Save and send a test email.

## Notes

- This template uses Supabase variables `{{ .ConfirmationURL }}` and `{{ .Email }}`.
- If you update site colors, keep this template in sync.
- Email client CSS support varies, so layout uses simple table markup and inline styles.
