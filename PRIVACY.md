# Privacy Policy

**Anime AutoPlay** (the "Extension") is committed to protecting your privacy. This policy explains what data the Extension collects, how it is used, and your rights.

## Data Collection

The Extension **does not collect, store, or share any personal data**. Specifically:

- **No personal information**: The Extension does not collect your name, email address, IP address, or any other personally identifiable information.
- **No analytics**: The Extension does not use analytics services, tracking pixels, or telemetry.
- **No third-party services**: The Extension does not send data to any external servers or services.
- **No advertising**: The Extension does not serve, display, or track advertisements.

## Data Storage

The only data stored by the Extension is **user preferences**, saved locally in your browser using Chrome's built-in `storage.sync` and `storage.local` APIs:

- Autoplay toggle (on/off)
- Countdown duration (3–15 seconds)
- Intro skip times (start and end timestamps)
- Intro skip mode (manual or automatic)
- Ending skip offset
- Player/server memory preference
- Auto fullscreen toggle
- Interface language (Spanish / English)
- Night mode settings (on/off and number of episodes before autoplay stops)
- **Watch history**: for each series, the title and episode number taken from the page address, the address of that episode page, and the time it was recorded. It is saved only when the countdown finished and the Extension moved on to the next episode. It is shown in the Extension's popup, can be deleted per series or all at once from there, and keeps at most 100 series per website.

The watch history is kept in `storage.local` and is **never synced or transmitted**. The remaining data is stored **solely on your device** and synced across your Chrome browsers **only through your Google account** if you have Chrome sync enabled. The Extension developer has no access to this data.

## Website Access

The Extension runs only on websites you visit. It reads minimal page information (video elements, navigation buttons) solely to provide its functionality — detecting when an episode ends and offering to play the next one. It does not read, modify, or transmit the content of web pages beyond what is strictly necessary for its stated purpose.

## Changes to This Policy

If this policy changes, the updated version will be posted here. Continued use of the Extension after changes constitutes acceptance of the updated policy.

## Contact

For questions about this privacy policy, please open an issue at the Extension's GitHub repository or contact the developer at the repository's listed contact address.

*Last updated: October 2026*
