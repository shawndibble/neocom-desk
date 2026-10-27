package com.neocomdesk.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;

/**
 * Opens this app's Android notification settings, then gets out of the way.
 *
 * Chrome won't open Android settings screens from a web page, but it will open
 * a BROWSABLE activity in an installed app, so the web app's "Open notification
 * settings" button (src/lib/playStoreApp.ts) comes here via
 * intent://notification-settings#Intent;scheme=neocomdesk;package=...;end.
 *
 * Not part of Bubblewrap's template: scripts/twa/patch-android.mjs copies it in
 * after every `bubblewrap update`. Exported, but all any caller can do is open
 * this app's own settings screen.
 */
public class NotificationSettingsActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
        } else {
            // No per-app notification screen before Android 8; app info has the toggle.
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.fromParts("package", getPackageName(), null));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(intent);
        } catch (RuntimeException e) {
            // A trimmed-down ROM without the screen: nothing to open, just return.
        }
        finish();
    }
}
