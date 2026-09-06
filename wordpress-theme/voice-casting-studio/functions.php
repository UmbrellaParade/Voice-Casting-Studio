<?php
/**
 * Voice Cast Studio theme bootstrap and private REST API.
 *
 * @package VoiceCastingStudio
 */

if (!defined('ABSPATH')) {
    exit;
}

const VCS_REST_NAMESPACE = 'voice-casting-studio/v1';
const VCS_WORKSPACE_POST_TYPE = 'vcs_workspace';
const VCS_MANAGER_CAPABILITY = 'manage_voice_casting_studio';
const VCS_SCRIPT_CAPABILITY = 'edit_voice_casting_scripts';
const VCS_ROLE_SCHEMA_VERSION = '2';
const VCS_AUDITION_AUTOMATION_OPTION = '_vcs_audition_automation';
const VCS_AUDITION_OPENAI_MODEL = 'gpt-image-2';
const VCS_AUDITION_AUDIT_MODEL = 'gpt-5.6-luna';
const VCS_AUDITION_MAX_IMAGE_ATTEMPTS = 3;
const VCS_ACCENT_RESEARCH_MODEL = 'gpt-5.6-luna';
const VCS_ACCENT_RESEARCH_HOURLY_LIMIT = 15;
const VCS_ACCENT_RESEARCH_DAILY_LIMIT = 300;
const VCS_ACCENT_RESEARCH_API_ENABLED = false;
const VCS_ELEVENLABS_USER_META = '_vcs_elevenlabs_settings';
const VCS_ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const VCS_ELEVENLABS_MODEL = 'eleven_text_to_sound_v2';
const VCS_ELEVENLABS_OUTPUT_FORMAT = 'mp3_44100_128';
const VCS_ELEVENLABS_PROMPT_MAX_LENGTH = 450;

function vcs_setup_theme(): void
{
    add_theme_support('title-tag');
    show_admin_bar(false);
}
add_action('after_setup_theme', 'vcs_setup_theme');

function vcs_output_brand_icons(): void
{
    $asset_uri = trailingslashit(get_template_directory_uri() . '/assets/assets');
    $version = (string) wp_get_theme()->get('Version');
    $icon_32 = add_query_arg('ver', $version, $asset_uri . 'voice-cast-studio-icon-32.png');
    $icon_180 = add_query_arg('ver', $version, $asset_uri . 'voice-cast-studio-icon-180.png');
    $icon_192 = add_query_arg('ver', $version, $asset_uri . 'voice-cast-studio-icon-192.png');
    ?>
    <link rel="icon" type="image/png" sizes="32x32" href="<?php echo esc_url($icon_32); ?>">
    <link rel="shortcut icon" type="image/png" href="<?php echo esc_url($icon_32); ?>">
    <link rel="icon" type="image/png" sizes="192x192" href="<?php echo esc_url($icon_192); ?>">
    <link rel="apple-touch-icon" sizes="180x180" href="<?php echo esc_url($icon_180); ?>">
    <meta name="theme-color" content="#241d2d">
    <?php
}
add_action('wp_head', 'vcs_output_brand_icons', 1000);
add_action('admin_head', 'vcs_output_brand_icons', 1000);

function vcs_register_workspace_post_type(): void
{
    register_post_type(VCS_WORKSPACE_POST_TYPE, [
        'labels' => [
            'name' => 'Voice Cast Studio',
            'singular_name' => 'Voice Cast Workspace',
        ],
        'public' => false,
        'show_ui' => current_user_can(VCS_MANAGER_CAPABILITY),
        'show_in_rest' => false,
        // The workspace keeps its own script snapshots. Creating a full WordPress
        // revision on every debounced save duplicates several MB of JSON.
        'supports' => ['title'],
        'capability_type' => 'post',
        'map_meta_cap' => true,
    ]);
}
add_action('init', 'vcs_register_workspace_post_type');

function vcs_activate_roles(): void
{
    add_role('voice_actor', 'Voice Actor', [
        'read' => true,
    ]);
    add_role('voice_director', 'Voice Director', [
        'read' => true,
        'upload_files' => true,
        VCS_MANAGER_CAPABILITY => true,
    ]);
    add_role('voice_script_owner', 'Voice Script Owner', [
        'read' => true,
        'upload_files' => true,
        VCS_MANAGER_CAPABILITY => true,
        VCS_SCRIPT_CAPABILITY => true,
    ]);

    $director = get_role('voice_director');
    if ($director) {
        $director->add_cap('read');
        $director->add_cap('upload_files');
        $director->add_cap(VCS_MANAGER_CAPABILITY);
        $director->remove_cap(VCS_SCRIPT_CAPABILITY);
    }
    $owner = get_role('voice_script_owner');
    if ($owner) {
        $owner->add_cap('read');
        $owner->add_cap('upload_files');
        $owner->add_cap(VCS_MANAGER_CAPABILITY);
        $owner->add_cap(VCS_SCRIPT_CAPABILITY);
    }

    $administrator = get_role('administrator');
    if ($administrator) {
        $administrator->add_cap(VCS_MANAGER_CAPABILITY);
        $administrator->add_cap(VCS_SCRIPT_CAPABILITY);
    }
    update_option('_vcs_role_schema_version', VCS_ROLE_SCHEMA_VERSION, false);
}
add_action('after_switch_theme', 'vcs_activate_roles');

function vcs_maybe_upgrade_roles(): void
{
    if (VCS_ROLE_SCHEMA_VERSION !== get_option('_vcs_role_schema_version')) {
        vcs_activate_roles();
    }
}
add_action('init', 'vcs_maybe_upgrade_roles', 1);

function vcs_prepare_anonymous_member_portal(): void
{
    if (!is_user_logged_in()) {
        nocache_headers();
        header('X-Robots-Tag: noindex, nofollow', true);
    }
}
add_action('template_redirect', 'vcs_prepare_anonymous_member_portal');

function vcs_enqueue_application(): void
{
    $theme_dir = get_template_directory();
    $theme_uri = get_template_directory_uri();
    $css_path = $theme_dir . '/assets/app.css';
    $js_path = $theme_dir . '/assets/app.js';

    wp_enqueue_style(
        'voice-casting-studio-app',
        $theme_uri . '/assets/app.css',
        [],
        file_exists($css_path) ? (string) filemtime($css_path) : null
    );
    wp_enqueue_script(
        'voice-casting-studio-app',
        $theme_uri . '/assets/app.js',
        [],
        file_exists($js_path) ? (string) filemtime($js_path) : null,
        true
    );

    $user = wp_get_current_user();
    wp_localize_script('voice-casting-studio-app', 'VoiceCastingStudio', [
        'mode' => 'wordpress',
        'assetBaseUrl' => trailingslashit($theme_uri . '/assets'),
        'assetVersion' => (string) wp_get_theme()->get('Version'),
        'restUrl' => trailingslashit(rest_url(VCS_REST_NAMESPACE)),
        'nonce' => is_user_logged_in() ? wp_create_nonce('wp_rest') : '',
        'publicNonce' => !is_user_logged_in() ? wp_create_nonce('vcs_public_collaboration') : '',
        'siteName' => get_bloginfo('name') ?: 'Voice Cast Studio',
        'logoutUrl' => is_user_logged_in() ? wp_logout_url(home_url('/')) : '',
        'shareAccess' => !is_user_logged_in() ? [
            'projectId' => sanitize_text_field((string) wp_unslash($_GET['vcs_project'] ?? '')),
            'memberId' => sanitize_text_field((string) wp_unslash($_GET['vcs_member'] ?? '')),
            'accessKey' => sanitize_text_field((string) wp_unslash($_GET['vcs_key'] ?? '')),
        ] : null,
        'currentUser' => [
            'id' => (int) $user->ID,
            'name' => $user->display_name,
        ],
        'canManage' => current_user_can(VCS_MANAGER_CAPABILITY),
        'canEditScript' => current_user_can(VCS_SCRIPT_CAPABILITY),
    ]);
}
add_action('wp_enqueue_scripts', 'vcs_enqueue_application');

function vcs_module_script_tag(string $tag, string $handle): string
{
    if ('voice-casting-studio-app' !== $handle) {
        return $tag;
    }
    return str_replace('<script ', '<script type="module" ', $tag);
}
add_filter('script_loader_tag', 'vcs_module_script_tag', 10, 2);

function vcs_get_workspace_post(bool $create = false): ?WP_Post
{
    $posts = get_posts([
        'post_type' => VCS_WORKSPACE_POST_TYPE,
        'post_status' => ['private', 'draft'],
        'numberposts' => 1,
        'orderby' => 'ID',
        'order' => 'ASC',
    ]);
    if ($posts) {
        return $posts[0];
    }
    if (!$create || !current_user_can(VCS_SCRIPT_CAPABILITY)) {
        return null;
    }
    $post_id = wp_insert_post([
        'post_type' => VCS_WORKSPACE_POST_TYPE,
        'post_status' => 'private',
        'post_title' => 'Voice Cast Studio Workspace',
        'post_content' => '{}',
    ], true);
    return is_wp_error($post_id) ? null : get_post($post_id);
}

function vcs_decode_workspace(?WP_Post $post): array
{
    if (!$post) {
        return [];
    }
    $decoded = json_decode($post->post_content, true);
    return is_array($decoded) ? $decoded : [];
}

function vcs_workspace_has_embedded_audio(mixed $value): bool
{
    if (is_string($value)) {
        return str_starts_with(strtolower(trim($value)), 'data:audio/');
    }
    if (!is_array($value)) {
        return false;
    }
    foreach ($value as $child) {
        if (vcs_workspace_has_embedded_audio($child)) {
            return true;
        }
    }
    return false;
}

function vcs_workspace_recording_urls_are_drive(mixed $value): bool
{
    if (!is_array($value)) {
        return true;
    }
    foreach ($value as $key => $child) {
        if ('recordingUrl' === $key && is_string($child) && !vcs_is_google_drive_url(trim($child))) {
            return false;
        }
        if (!vcs_workspace_recording_urls_are_drive($child)) {
            return false;
        }
    }
    return true;
}

function vcs_write_workspace(array $data): WP_REST_Response|WP_Error
{
    foreach (($data['recordingProjects'] ?? []) as $project_index => $project) {
        if (!is_array($project) || !isset($project['scriptSnapshots']) || !is_array($project['scriptSnapshots'])) {
            continue;
        }
        $data['recordingProjects'][$project_index]['scriptSnapshots'] = array_slice($project['scriptSnapshots'], 0, 8);
    }
    if (vcs_workspace_has_embedded_audio($data)) {
        return new WP_Error('vcs_embedded_audio_rejected', 'Audio must be stored in Google Drive and referenced by URL.', ['status' => 400]);
    }
    if (!vcs_workspace_recording_urls_are_drive($data)) {
        return new WP_Error('vcs_recording_url_rejected', 'Recording URLs must point to Google Drive.', ['status' => 400]);
    }
    $encoded = wp_json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($encoded) || strlen($encoded) > 10 * MB_IN_BYTES) {
        return new WP_Error('vcs_workspace_too_large', 'Workspace data is too large.', ['status' => 413]);
    }
    $post = vcs_get_workspace_post(true);
    if (!$post) {
        return new WP_Error('vcs_workspace_unavailable', 'Workspace could not be created.', ['status' => 500]);
    }
    $result = wp_update_post([
        'ID' => $post->ID,
        'post_content' => wp_slash($encoded),
        'post_status' => 'private',
    ], true);
    if (is_wp_error($result)) {
        return $result;
    }
    $version = (int) get_post_meta($post->ID, '_vcs_workspace_version', true) + 1;
    update_post_meta($post->ID, '_vcs_workspace_version', $version);
    return rest_ensure_response([
        'ok' => true,
        'version' => $version,
        'updatedAt' => current_time('c'),
    ]);
}

function vcs_rest_logged_in(): bool
{
    return is_user_logged_in();
}

function vcs_rest_can_manage(): bool
{
    return is_user_logged_in() && current_user_can(VCS_MANAGER_CAPABILITY);
}

function vcs_rest_can_edit_script(): bool
{
    return is_user_logged_in() && current_user_can(VCS_SCRIPT_CAPABILITY);
}

function vcs_encrypt_secret(string $plaintext): string|WP_Error
{
    if ('' === $plaintext) {
        return '';
    }
    if (!function_exists('openssl_encrypt')) {
        return new WP_Error('vcs_encryption_unavailable', 'このサーバーではAPIキーを安全に保存できません。', ['status' => 500]);
    }
    try {
        $iv = random_bytes(12);
    } catch (Throwable $error) {
        return new WP_Error('vcs_encryption_random_failed', 'APIキーの暗号化を開始できませんでした。', ['status' => 500]);
    }
    $tag = '';
    $key = hash('sha256', wp_salt('auth') . '|voice-cast-studio|audition', true);
    $ciphertext = openssl_encrypt(
        $plaintext,
        'aes-256-gcm',
        $key,
        OPENSSL_RAW_DATA,
        $iv,
        $tag,
        VCS_AUDITION_AUTOMATION_OPTION
    );
    if (false === $ciphertext) {
        return new WP_Error('vcs_encryption_failed', 'APIキーを暗号化できませんでした。', ['status' => 500]);
    }
    return 'v1:' . base64_encode($iv . $tag . $ciphertext);
}

function vcs_decrypt_secret(string $stored): string
{
    if (!str_starts_with($stored, 'v1:') || !function_exists('openssl_decrypt')) {
        return '';
    }
    $decoded = base64_decode(substr($stored, 3), true);
    if (!is_string($decoded) || strlen($decoded) < 29) {
        return '';
    }
    $iv = substr($decoded, 0, 12);
    $tag = substr($decoded, 12, 16);
    $ciphertext = substr($decoded, 28);
    $key = hash('sha256', wp_salt('auth') . '|voice-cast-studio|audition', true);
    $plaintext = openssl_decrypt(
        $ciphertext,
        'aes-256-gcm',
        $key,
        OPENSSL_RAW_DATA,
        $iv,
        $tag,
        VCS_AUDITION_AUTOMATION_OPTION
    );
    return is_string($plaintext) ? $plaintext : '';
}

function vcs_get_audition_automation_option(): array
{
    $settings = get_option(VCS_AUDITION_AUTOMATION_OPTION, []);
    return is_array($settings) ? $settings : [];
}

function vcs_get_audition_automation_secret(array $settings, string $key): string
{
    return vcs_decrypt_secret((string) ($settings[$key] ?? ''));
}

function vcs_safe_audition_automation_settings(?array $settings = null): array
{
    $settings ??= vcs_get_audition_automation_option();
    return [
        'hasOpenAiKey' => '' !== vcs_get_audition_automation_secret($settings, 'openAiApiKey'),
        'appsScriptConfigured' => '' !== vcs_get_audition_automation_secret($settings, 'appsScriptWebAppUrl')
            && '' !== vcs_get_audition_automation_secret($settings, 'appsScriptSecret'),
        'model' => VCS_AUDITION_OPENAI_MODEL,
        'auditModel' => VCS_AUDITION_AUDIT_MODEL,
        'maxImageAttempts' => VCS_AUDITION_MAX_IMAGE_ATTEMPTS,
        'headerSize' => '1600x400',
        'socialSize' => '1792x1008',
        'headerThemeNeedsManualSelection' => true,
        'updatedAt' => (string) ($settings['updatedAt'] ?? ''),
    ];
}

function vcs_get_elevenlabs_user_settings(?int $user_id = null): array
{
    $user_id ??= get_current_user_id();
    if ($user_id <= 0) {
        return [];
    }
    $settings = get_user_meta($user_id, VCS_ELEVENLABS_USER_META, true);
    return is_array($settings) ? $settings : [];
}

function vcs_get_elevenlabs_api_key(?array $settings = null): string
{
    $settings ??= vcs_get_elevenlabs_user_settings();
    return vcs_decrypt_secret((string) ($settings['apiKey'] ?? ''));
}

function vcs_elevenlabs_error_message(int $status, mixed $payload = null): string
{
    if (401 === $status) {
        return 'ElevenLabs APIキーが無効です。キーを作り直して登録してください。';
    }
    if (403 === $status) {
        return 'ElevenLabs APIキーの権限が不足しています。Sound Effectsの生成とUserの読み取りを許可してください。';
    }
    if (429 === $status) {
        return 'ElevenLabsの利用枠またはAPIキーの上限に達しました。残量を確認してください。';
    }
    if (422 === $status) {
        return 'ElevenLabsがプロンプトまたは生成条件を受け付けませんでした。長さと文章を確認してください。';
    }
    if ($status >= 500) {
        return 'ElevenLabs側で一時的なエラーが発生しています。時間をおいてもう一度お試しください。';
    }
    $detail = '';
    if (is_array($payload)) {
        $raw_detail = $payload['detail'] ?? $payload['message'] ?? '';
        if (is_array($raw_detail)) {
            $raw_detail = $raw_detail['message'] ?? $raw_detail['detail'] ?? '';
        }
        if (is_scalar($raw_detail)) {
            $detail = sanitize_text_field((string) $raw_detail);
        }
    }
    return '' !== $detail ? 'ElevenLabs: ' . $detail : 'ElevenLabsへの接続に失敗しました。';
}

function vcs_fetch_elevenlabs_subscription(string $api_key): array|WP_Error
{
    $response = wp_remote_get(VCS_ELEVENLABS_API_BASE . '/user/subscription', [
        'timeout' => 20,
        'redirection' => 0,
        'headers' => [
            'Accept' => 'application/json',
            'xi-api-key' => $api_key,
        ],
    ]);
    if (is_wp_error($response)) {
        return new WP_Error('vcs_elevenlabs_unreachable', 'ElevenLabsへ接続できませんでした。通信状態を確認してください。', ['status' => 502]);
    }
    $status = (int) wp_remote_retrieve_response_code($response);
    $payload = json_decode((string) wp_remote_retrieve_body($response), true);
    if (200 !== $status || !is_array($payload)) {
        return new WP_Error(
            'vcs_elevenlabs_subscription_error',
            vcs_elevenlabs_error_message($status, $payload),
            ['status' => in_array($status, [401, 403, 429], true) ? $status : 502]
        );
    }
    return $payload;
}

function vcs_sync_elevenlabs_subscription(array $settings, array $subscription): array
{
    $next_reset_unix = max(0, (int) ($subscription['next_character_count_reset_unix'] ?? 0));
    $stored_reset_unix = max(0, (int) ($settings['usageResetUnix'] ?? 0));
    if ($next_reset_unix > 0 && $stored_reset_unix > 0 && $next_reset_unix !== $stored_reset_unix) {
        $settings['toolGenerationCount'] = 0;
        $settings['toolCreditsSpent'] = 0;
    }
    if ($next_reset_unix > 0) {
        $settings['usageResetUnix'] = $next_reset_unix;
    }
    $settings['subscription'] = [
        'tier' => sanitize_key((string) ($subscription['tier'] ?? '')),
        'status' => sanitize_key((string) ($subscription['status'] ?? '')),
        'creditsUsed' => max(0, (int) ($subscription['credit_count'] ?? $subscription['character_count'] ?? 0)),
        'creditLimit' => max(0, (int) ($subscription['credit_limit'] ?? $subscription['character_limit'] ?? 0)),
        'nextResetUnix' => $next_reset_unix,
        'maxCreditLimitExtension' => is_numeric($subscription['max_credit_limit_extension'] ?? null)
            ? max(0, (int) $subscription['max_credit_limit_extension'])
            : (string) ($subscription['max_credit_limit_extension'] ?? ''),
    ];
    $settings['checkedAt'] = current_time('c');
    return $settings;
}

function vcs_safe_elevenlabs_settings(?array $settings = null, string $connection_warning = ''): array
{
    $settings ??= vcs_get_elevenlabs_user_settings();
    $subscription = is_array($settings['subscription'] ?? null) ? $settings['subscription'] : [];
    $next_reset_unix = max(0, (int) ($subscription['nextResetUnix'] ?? $settings['usageResetUnix'] ?? 0));
    return [
        'hasApiKey' => '' !== vcs_get_elevenlabs_api_key($settings),
        'connected' => '' !== vcs_get_elevenlabs_api_key($settings) && '' === $connection_warning,
        'tier' => (string) ($subscription['tier'] ?? ''),
        'subscriptionStatus' => (string) ($subscription['status'] ?? ''),
        'creditsUsed' => max(0, (int) ($subscription['creditsUsed'] ?? 0)),
        'creditLimit' => max(0, (int) ($subscription['creditLimit'] ?? 0)),
        'nextResetAt' => $next_reset_unix > 0 ? gmdate('c', $next_reset_unix) : '',
        'maxCreditLimitExtension' => $subscription['maxCreditLimitExtension'] ?? 0,
        'toolGenerationCount' => max(0, (int) ($settings['toolGenerationCount'] ?? 0)),
        'toolCreditsSpent' => max(0, (int) ($settings['toolCreditsSpent'] ?? 0)),
        'connectionWarning' => $connection_warning,
        'model' => VCS_ELEVENLABS_MODEL,
        'outputFormat' => VCS_ELEVENLABS_OUTPUT_FORMAT,
        'updatedAt' => (string) ($settings['updatedAt'] ?? ''),
        'checkedAt' => (string) ($settings['checkedAt'] ?? ''),
    ];
}

function vcs_rest_get_elevenlabs_settings(): WP_REST_Response
{
    $user_id = get_current_user_id();
    $settings = vcs_get_elevenlabs_user_settings($user_id);
    $api_key = vcs_get_elevenlabs_api_key($settings);
    if ('' === $api_key) {
        return rest_ensure_response(vcs_safe_elevenlabs_settings($settings));
    }

    $subscription = vcs_fetch_elevenlabs_subscription($api_key);
    if (is_wp_error($subscription)) {
        return rest_ensure_response(vcs_safe_elevenlabs_settings($settings, $subscription->get_error_message()));
    }

    $settings = vcs_sync_elevenlabs_subscription($settings, $subscription);
    update_user_meta($user_id, VCS_ELEVENLABS_USER_META, $settings);
    return rest_ensure_response(vcs_safe_elevenlabs_settings($settings));
}

function vcs_rest_save_elevenlabs_settings(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $params = $request->get_json_params();
    if (!is_array($params)) {
        return new WP_Error('vcs_elevenlabs_settings_required', '設定内容を読み取れませんでした。', ['status' => 400]);
    }

    $user_id = get_current_user_id();
    if (!empty($params['clearApiKey'])) {
        delete_user_meta($user_id, VCS_ELEVENLABS_USER_META);
        return rest_ensure_response(vcs_safe_elevenlabs_settings([]));
    }

    $api_key = trim((string) ($params['apiKey'] ?? ''));
    if (strlen($api_key) < 20 || strlen($api_key) > 256 || preg_match('/\s/u', $api_key)) {
        return new WP_Error('vcs_elevenlabs_key_invalid', 'ElevenLabs APIキーの形式を確認してください。', ['status' => 400]);
    }

    $subscription = vcs_fetch_elevenlabs_subscription($api_key);
    if (is_wp_error($subscription)) {
        return $subscription;
    }

    $encrypted = vcs_encrypt_secret($api_key);
    if (is_wp_error($encrypted)) {
        return $encrypted;
    }

    $previous = vcs_get_elevenlabs_user_settings($user_id);
    $fingerprint = hash('sha256', $api_key);
    $same_key = '' !== (string) ($previous['keyFingerprint'] ?? '')
        && hash_equals((string) $previous['keyFingerprint'], $fingerprint);
    $settings = [
        'apiKey' => $encrypted,
        'keyFingerprint' => $fingerprint,
        'toolGenerationCount' => $same_key ? max(0, (int) ($previous['toolGenerationCount'] ?? 0)) : 0,
        'toolCreditsSpent' => $same_key ? max(0, (int) ($previous['toolCreditsSpent'] ?? 0)) : 0,
        'usageResetUnix' => $same_key ? max(0, (int) ($previous['usageResetUnix'] ?? 0)) : 0,
        'updatedAt' => current_time('c'),
    ];
    $settings = vcs_sync_elevenlabs_subscription($settings, $subscription);
    update_user_meta($user_id, VCS_ELEVENLABS_USER_META, $settings);
    return rest_ensure_response(vcs_safe_elevenlabs_settings($settings));
}

function vcs_rest_generate_elevenlabs_sound(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $params = $request->get_json_params();
    if (!is_array($params) || true !== ($params['confirmed'] ?? false)) {
        return new WP_Error('vcs_elevenlabs_confirmation_required', '生成前の確認が必要です。', ['status' => 400]);
    }

    $prompt = trim(wp_strip_all_tags((string) ($params['prompt'] ?? '')));
    $prompt = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $prompt) ?: '';
    $prompt_length = function_exists('mb_strlen') ? mb_strlen($prompt) : strlen($prompt);
    if ('' === $prompt || $prompt_length > VCS_ELEVENLABS_PROMPT_MAX_LENGTH) {
        return new WP_Error('vcs_elevenlabs_prompt_invalid', 'プロンプトは1文字以上、450文字以内で入力してください。', ['status' => 400]);
    }

    $duration = is_numeric($params['durationSeconds'] ?? null) ? (float) $params['durationSeconds'] : 4.0;
    $duration = min(30.0, max(0.5, round($duration, 1)));
    $prompt_influence = is_numeric($params['promptInfluence'] ?? null) ? (float) $params['promptInfluence'] : 0.3;
    $prompt_influence = min(1.0, max(0.0, round($prompt_influence, 2)));
    $loop = !empty($params['loop']);

    $user_id = get_current_user_id();
    $settings = vcs_get_elevenlabs_user_settings($user_id);
    $api_key = vcs_get_elevenlabs_api_key($settings);
    if ('' === $api_key) {
        return new WP_Error('vcs_elevenlabs_key_required', '先にElevenLabs APIキーを登録してください。', ['status' => 409]);
    }

    $lock_key = 'vcs_elevenlabs_generate_' . $user_id;
    if (get_transient($lock_key)) {
        return new WP_Error('vcs_elevenlabs_generation_locked', '現在、別のSEを生成中です。完了まで少しお待ちください。', ['status' => 409]);
    }
    set_transient($lock_key, '1', 150);

    try {
        $response = wp_remote_post(
            VCS_ELEVENLABS_API_BASE . '/sound-generation?output_format=' . rawurlencode(VCS_ELEVENLABS_OUTPUT_FORMAT),
            [
                'timeout' => 120,
                'redirection' => 0,
                'headers' => [
                    'Accept' => 'audio/mpeg',
                    'Content-Type' => 'application/json',
                    'xi-api-key' => $api_key,
                ],
                'body' => wp_json_encode([
                    'text' => $prompt,
                    'duration_seconds' => $duration,
                    'prompt_influence' => $prompt_influence,
                    'loop' => $loop,
                    'model_id' => VCS_ELEVENLABS_MODEL,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]
        );
        if (is_wp_error($response)) {
            return new WP_Error('vcs_elevenlabs_unreachable', 'ElevenLabsへ接続できませんでした。通信状態を確認してください。', ['status' => 502]);
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $audio = (string) wp_remote_retrieve_body($response);
        if ($status < 200 || $status >= 300) {
            $payload = json_decode($audio, true);
            return new WP_Error(
                'vcs_elevenlabs_generation_error',
                vcs_elevenlabs_error_message($status, is_array($payload) ? $payload : null),
                ['status' => in_array($status, [401, 403, 422, 429], true) ? $status : 502]
            );
        }
        if ('' === $audio || strlen($audio) > 8 * MB_IN_BYTES) {
            return new WP_Error('vcs_elevenlabs_audio_invalid', '生成音声を安全に受け取れませんでした。', ['status' => 502]);
        }

        $content_type = strtolower((string) wp_remote_retrieve_header($response, 'content-type'));
        if ('' !== $content_type && !str_contains($content_type, 'audio/') && !str_contains($content_type, 'octet-stream')) {
            return new WP_Error('vcs_elevenlabs_audio_type_invalid', 'ElevenLabsから音声以外の応答が返されました。', ['status' => 502]);
        }

        $credit_cost = max(0, (int) (
            wp_remote_retrieve_header($response, 'character-cost')
            ?: wp_remote_retrieve_header($response, 'x-character-cost')
            ?: 0
        ));
        $settings['toolGenerationCount'] = max(0, (int) ($settings['toolGenerationCount'] ?? 0)) + 1;
        $settings['toolCreditsSpent'] = max(0, (int) ($settings['toolCreditsSpent'] ?? 0)) + $credit_cost;
        $settings['lastGeneratedAt'] = current_time('c');

        $subscription = vcs_fetch_elevenlabs_subscription($api_key);
        $connection_warning = '';
        if (is_wp_error($subscription)) {
            $connection_warning = $subscription->get_error_message();
        } else {
            $settings = vcs_sync_elevenlabs_subscription($settings, $subscription);
        }
        update_user_meta($user_id, VCS_ELEVENLABS_USER_META, $settings);

        $requested_name = sanitize_file_name((string) ($params['fileName'] ?? ''));
        $file_name = '' !== $requested_name ? $requested_name : 'sound-effect_ElevenLabs.mp3';
        if (!str_ends_with(strtolower($file_name), '.mp3')) {
            $file_name .= '.mp3';
        }

        return rest_ensure_response([
            'ok' => true,
            'audioBase64' => base64_encode($audio),
            'mimeType' => 'audio/mpeg',
            'fileName' => $file_name,
            'durationSeconds' => $duration,
            'creditsUsed' => $credit_cost,
            'requestId' => sanitize_text_field((string) wp_remote_retrieve_header($response, 'request-id')),
            'generatedAt' => current_time('c'),
            'settings' => vcs_safe_elevenlabs_settings($settings, $connection_warning),
        ]);
    } finally {
        delete_transient($lock_key);
    }
}

function vcs_request_has_public_collaboration_access(WP_REST_Request $request): bool
{
    $nonce = sanitize_text_field((string) $request->get_header('X-VCS-Public-Nonce'));
    return '' !== $nonce && false !== wp_verify_nonce($nonce, 'vcs_public_collaboration');
}

function vcs_request_public_member_id(WP_REST_Request $request): string
{
    return substr(sanitize_text_field((string) $request->get_header('X-VCS-Public-Member')), 0, 100);
}

function vcs_request_share_reference(WP_REST_Request $request): array
{
    return [
        'projectId' => sanitize_text_field((string) $request->get_header('X-VCS-Project')),
        'memberId' => sanitize_text_field((string) $request->get_header('X-VCS-Member')),
        'accessKey' => sanitize_text_field((string) $request->get_header('X-VCS-Key')),
    ];
}

function vcs_get_share_context(WP_REST_Request $request, ?array $workspace = null): ?array
{
    $reference = vcs_request_share_reference($request);
    if ('' === $reference['projectId'] || '' === $reference['memberId'] || '' === $reference['accessKey']) {
        return null;
    }
    $workspace ??= vcs_decode_workspace(vcs_get_workspace_post(false));
    foreach (($workspace['recordingProjects'] ?? []) as $project_index => $project) {
        if (!is_array($project) || (string) ($project['id'] ?? '') !== $reference['projectId']) {
            continue;
        }
        foreach (($project['castMembers'] ?? []) as $member) {
            if (!is_array($member)) {
                continue;
            }
            $stored_key = (string) ($member['accessKey'] ?? '');
            if ((string) ($member['id'] ?? '') !== $reference['memberId']
                || '' === $stored_key
                || !hash_equals($stored_key, $reference['accessKey'])) {
                continue;
            }
            return [
                'projectIndex' => (int) $project_index,
                'project' => $project,
                'member' => $member,
                'characterIds' => array_values(array_filter(array_map('strval', $member['characterIds'] ?? []))),
            ];
        }
    }
    return null;
}

function vcs_rest_actor_access(WP_REST_Request $request): bool|WP_Error
{
    if (is_user_logged_in() || vcs_get_share_context($request) || vcs_request_has_public_collaboration_access($request)) {
        return true;
    }
    return new WP_Error(
        'vcs_member_link_required',
        '共有画面を再読み込みしてから、もう一度お試しください。',
        ['status' => 401]
    );
}

function vcs_canonicalize_value(mixed $value): mixed
{
    if (!is_array($value)) {
        return $value;
    }
    $is_list = [] === $value || array_keys($value) === range(0, count($value) - 1);
    if ($is_list) {
        return array_map('vcs_canonicalize_value', $value);
    }
    ksort($value);
    foreach ($value as $key => $child) {
        $value[$key] = vcs_canonicalize_value($child);
    }
    return $value;
}

function vcs_normalize_studio_concept(array $data): array
{
    $concept = is_array($data['studioConcept'] ?? null) ? $data['studioConcept'] : [];
    return [
        'title' => (string) ($concept['title'] ?? 'Umbrella Parade'),
        'tagline' => (string) ($concept['tagline'] ?? ''),
        'body' => (string) ($concept['body'] ?? ''),
        'vision' => (string) ($concept['vision'] ?? ''),
        'principles' => (string) ($concept['principles'] ?? ''),
    ];
}

function vcs_character_alias_token(string $value): string
{
    $value = preg_replace('/[\s()[\]【】〈〉《》「」『』・･／\/\\:：_\-―—–]+/u', '', trim($value));
    return strtolower((string) $value);
}

function vcs_character_script_name(array $character): string
{
    $explicit = trim((string) ($character['scriptName'] ?? $character['shortName'] ?? ''));
    if ('' !== $explicit) {
        return $explicit;
    }

    $name = trim((string) ($character['name'] ?? ''));
    if ('' === $name) {
        return '';
    }
    $first_name = preg_split('/[・･]/u', $name)[0] ?? $name;
    $short_name = trim((string) preg_replace('/(?:第)?(?:[0-9]+|[〇零一二三四五六七八九十百千]+)世$/u', '', trim($first_name)));
    if ('' !== $short_name && $short_name !== $name) {
        return $short_name;
    }

    $name_token = vcs_character_alias_token($name);
    $matched_alias = '';
    foreach ((array) ($character['scriptAliases'] ?? []) as $alias) {
        $alias = trim((string) $alias);
        $alias_token = vcs_character_alias_token($alias);
        if ('' === $alias_token || strlen($alias_token) >= strlen($name_token) || !str_contains($name_token, $alias_token)) {
            continue;
        }
        if ('' === $matched_alias || strlen($alias_token) < strlen(vcs_character_alias_token($matched_alias))) {
            $matched_alias = $alias;
        }
    }
    return '' !== $matched_alias ? $matched_alias : $name;
}

function vcs_extract_script_structure(array $data): array
{
    $projects = [];
    foreach (($data['recordingProjects'] ?? []) as $project) {
        if (!is_array($project)) {
            continue;
        }
        $character_ids = [];
        $project_characters = is_array($project['characters'] ?? null) ? $project['characters'] : [];
        $normalized_project_characters = [];
        foreach ($project_characters as $character) {
            if (!is_array($character)) {
                continue;
            }
            $character['scriptAliases'] = array_values(array_map(
                'strval',
                is_array($character['scriptAliases'] ?? null) ? $character['scriptAliases'] : []
            ));
            $character['scriptName'] = vcs_character_script_name($character);
            $normalized_project_characters[] = $character;
            $character_id = (string) ($character['id'] ?? '');
            if ('' !== $character_id && !in_array($character_id, $character_ids, true)) {
                $character_ids[] = $character_id;
            }
        }
        $recording_folder_order = [];
        $configured_folder_order = is_array($project['recordingFolderOrder'] ?? null) ? $project['recordingFolderOrder'] : [];
        foreach ($configured_folder_order as $character_id) {
            $character_id = (string) $character_id;
            if (in_array($character_id, $character_ids, true) && !in_array($character_id, $recording_folder_order, true)) {
                $recording_folder_order[] = $character_id;
            }
        }
        foreach ($character_ids as $character_id) {
            if (!in_array($character_id, $recording_folder_order, true)) {
                $recording_folder_order[] = $character_id;
            }
        }
        $lines = [];
        foreach (($project['lines'] ?? []) as $line) {
            if (!is_array($line)) {
                continue;
            }
            $lines[] = [
                'id' => (string) ($line['id'] ?? ''),
                'chapterId' => (string) ($line['chapterId'] ?? ''),
                'chapterTitle' => (string) ($line['chapterTitle'] ?? '第一章'),
                'sceneId' => (string) ($line['sceneId'] ?? ''),
                'sceneTitle' => (string) ($line['sceneTitle'] ?? 'Scene 1'),
                'order' => (int) ($line['order'] ?? 0),
                'characterId' => (string) ($line['characterId'] ?? ''),
                'kind' => (string) ($line['kind'] ?? 'dialogue'),
                'text' => (string) ($line['text'] ?? ''),
                'direction' => (string) ($line['direction'] ?? ''),
                'fileName' => (string) ($line['fileName'] ?? ''),
            ];
        }
        $projects[] = [
            'id' => (string) ($project['id'] ?? ''),
            'title' => (string) ($project['title'] ?? ''),
            'status' => (string) ($project['status'] ?? ''),
            'scriptVersion' => (string) ($project['scriptVersion'] ?? '初稿'),
            'sourceScriptText' => (string) ($project['sourceScriptText'] ?? ''),
            'scriptSnapshots' => vcs_canonicalize_value($project['scriptSnapshots'] ?? []),
            'recordingDeadline' => (string) ($project['recordingDeadline'] ?? ''),
            'recordingDeadlineTime' => (string) ($project['recordingDeadlineTime'] ?? ''),
            'releaseDate' => (string) ($project['releaseDate'] ?? ''),
            'releaseTime' => (string) ($project['releaseTime'] ?? ''),
            'editingStatus' => (string) ($project['editingStatus'] ?? ''),
            'characters' => vcs_canonicalize_value($normalized_project_characters),
            'recordingFolderOrder' => $recording_folder_order,
            'castMembers' => vcs_canonicalize_value($project['castMembers'] ?? []),
            'materials' => vcs_canonicalize_value($project['materials'] ?? []),
            'requiredMaterials' => vcs_canonicalize_value($project['requiredMaterials'] ?? []),
            'dismissedRequiredMaterialKeys' => array_values(array_map(
                'strval',
                is_array($project['dismissedRequiredMaterialKeys'] ?? null) ? $project['dismissedRequiredMaterialKeys'] : []
            )),
            'materialSourceSites' => vcs_canonicalize_value($project['materialSourceSites'] ?? []),
            'requiredMaterialFolderUrl' => (string) ($project['requiredMaterialFolderUrl'] ?? ''),
            'requiredMaterialChapterFolders' => vcs_canonicalize_value($project['requiredMaterialChapterFolders'] ?? []),
            'tasks' => vcs_canonicalize_value($project['tasks'] ?? []),
            'contactTemplateSheetUrl' => (string) ($project['contactTemplateSheetUrl'] ?? ''),
            'contactTemplates' => vcs_canonicalize_value($project['contactTemplates'] ?? []),
            'contactMessageDrafts' => vcs_canonicalize_value($project['contactMessageDrafts'] ?? []),
            'manualContactRecipients' => vcs_canonicalize_value($project['manualContactRecipients'] ?? []),
            'otherRoleContact' => vcs_canonicalize_value($project['otherRoleContact'] ?? []),
            'auditionFormUrl' => (string) ($project['auditionFormUrl'] ?? ''),
            'auditionFormsFolderUrl' => (string) ($project['auditionFormsFolderUrl'] ?? ''),
            'auditionManagementSheetUrl' => (string) ($project['auditionManagementSheetUrl'] ?? ''),
            'auditionRoleProgress' => vcs_canonicalize_value($project['auditionRoleProgress'] ?? []),
            'scheduleItems' => vcs_canonicalize_value($project['scheduleItems'] ?? []),
            'deadlineItems' => vcs_canonicalize_value($project['deadlineItems'] ?? []),
            'announcements' => vcs_canonicalize_value($project['announcements'] ?? []),
            'sharedLinks' => vcs_canonicalize_value($project['sharedLinks'] ?? []),
            'lines' => $lines,
        ];
    }
    return [
        'studioConcept' => vcs_normalize_studio_concept($data),
        'recordingProjects' => $projects,
    ];
}

function vcs_strip_private_audition_progress(array $progress_items): array
{
    return array_values(array_map(
        static function (array $progress): array {
            unset(
                $progress['formEditUrl'],
                $progress['formResponderUrl'],
                $progress['headerImageUrl'],
                $progress['socialImageUrl'],
                $progress['auditionRoleSummary'],
                $progress['auditionLines'],
                $progress['auditionDeadline'],
                $progress['socialPostText'],
                $progress['socialPostUpdatedAt'],
                $progress['pcFinishMessage']
            );
            return $progress;
        },
        array_filter($progress_items, 'is_array')
    ));
}

function vcs_filter_project_for_actor(array $project, int $user_id, array $character_ids, string $member_id = ''): array
{
    unset(
        $project['scriptSnapshots'],
        $project['sourceScriptText'],
        $project['auditionFormsFolderUrl'],
        $project['auditionManagementSheetUrl'],
        $project['contactTemplateSheetUrl'],
        $project['contactTemplates'],
        $project['contactMessageDrafts'],
        $project['manualContactRecipients'],
        $project['otherRoleContact'],
        $project['socialTemplates'],
        $project['socialMessageDrafts'],
        $project['auditionApplicants'],
        $project['auditionApplicantsImportedAt'],
        $project['auditionFormFolderUrl'],
        $project['auditionFormUrl'],
        $project['auditionUrl']
    );
    $project['auditionRoleProgress'] = vcs_strip_private_audition_progress($project['auditionRoleProgress'] ?? []);
    $project['castMembers'] = array_values(array_map(
        static function (array $member): array {
            unset($member['contact'], $member['accessKey']);
            return $member;
        },
        array_filter(
            $project['castMembers'] ?? [],
            static fn(array $member): bool => '' !== $member_id
                ? (string) ($member['id'] ?? '') === $member_id
                : (int) ($member['wpUserId'] ?? 0) === $user_id
        )
    ));
    $project['characters'] = array_values(array_map(
        static function (array $character) use ($character_ids): array {
            if (!in_array((string) ($character['id'] ?? ''), $character_ids, true)) {
                unset($character['recordingFolderUrl'], $character['openChatUrl']);
            }
            return $character;
        },
        $project['characters'] ?? []
    ));
    $project['lines'] = array_values(array_map(
        static function (array $line) use ($character_ids): array {
            if (!in_array((string) ($line['characterId'] ?? ''), $character_ids, true)) {
                unset($line['recordingUrl'], $line['recordingFileName'], $line['actorNote']);
            }
            return $line;
        },
        $project['lines'] ?? []
    ));
    $derived_progress = [];
    foreach (($project['derivedLineProgress'] ?? []) as $line_id => $progress) {
        if (!is_array($progress)) {
            continue;
        }
        if (!in_array((string) ($progress['characterId'] ?? ''), $character_ids, true)) {
            unset($progress['recordingUrl'], $progress['recordingFileName'], $progress['actorNote']);
        }
        $derived_progress[(string) $line_id] = $progress;
    }
    $project['derivedLineProgress'] = $derived_progress;
    $project['questions'] = array_values(array_filter(
        $project['questions'] ?? [],
        static function (array $question) use ($user_id, $character_ids, $member_id): bool {
            if ('' !== $member_id && (string) ($question['castMemberId'] ?? '') === $member_id) {
                return true;
            }
            $question_user_id = (int) ($question['wpUserId'] ?? 0);
            if ($user_id > 0 && $question_user_id === $user_id) {
                return true;
            }
            return 0 === $question_user_id
                && '' === (string) ($question['castMemberId'] ?? '')
                && in_array((string) ($question['characterId'] ?? ''), $character_ids, true);
        }
    ));
    return $project;
}

function vcs_filter_project_for_shared_guest(array $project, string $public_member_id = ''): array
{
    unset(
        $project['scriptSnapshots'],
        $project['sourceScriptText'],
        $project['auditionFormsFolderUrl'],
        $project['auditionManagementSheetUrl'],
        $project['contactTemplateSheetUrl'],
        $project['contactTemplates'],
        $project['contactMessageDrafts'],
        $project['manualContactRecipients'],
        $project['otherRoleContact'],
        $project['socialTemplates'],
        $project['socialMessageDrafts'],
        $project['auditionApplicants'],
        $project['auditionApplicantsImportedAt'],
        $project['auditionFormFolderUrl'],
        $project['auditionFormUrl'],
        $project['auditionUrl']
    );
    $project['auditionRoleProgress'] = vcs_strip_private_audition_progress($project['auditionRoleProgress'] ?? []);
    $project['castMembers'] = array_values(array_map(
        static function (array $member): array {
            unset($member['contact'], $member['accessKey'], $member['wpUserId']);
            return $member;
        },
        array_filter($project['castMembers'] ?? [], 'is_array')
    ));
    $project['questions'] = array_values(array_map(
        static function (array $question) use ($public_member_id): array {
            $stored_public_member_id = (string) ($question['publicMemberId'] ?? '');
            $question['isOwnedByCurrentVisitor'] = '' !== $public_member_id
                && '' !== $stored_public_member_id
                && hash_equals($stored_public_member_id, $public_member_id);
            unset($question['wpUserId'], $question['castMemberId'], $question['publicMemberId']);
            return $question;
        },
        array_filter($project['questions'] ?? [], 'is_array')
    ));
    return $project;
}

function vcs_rest_get_workspace(WP_REST_Request $request): WP_REST_Response
{
    $post = vcs_get_workspace_post(false);
    $user = wp_get_current_user();
    $can_manage = current_user_can(VCS_MANAGER_CAPABILITY);
    $can_edit_script = current_user_can(VCS_SCRIPT_CAPABILITY);
    $current_cast_member_id = '';
    $access_mode = $can_manage ? 'manager' : 'actor';
    $workspace = $post ? vcs_decode_workspace($post) : null;
    if (is_array($workspace) && !$can_manage && !is_user_logged_in()) {
        $share_context = vcs_get_share_context($request, $workspace);
        $member = $share_context['member'] ?? [];
        if ($share_context) {
            $workspace = [
                'studioConcept' => vcs_normalize_studio_concept($workspace),
                'recordingProjects' => [vcs_filter_project_for_actor(
                    $share_context['project'],
                    (int) ($member['wpUserId'] ?? 0),
                    $share_context['characterIds'],
                    (string) ($member['id'] ?? '')
                )],
            ];
            $user = (object) [
                'ID' => 0,
                'display_name' => (string) ($member['actorName'] ?? '声優さん'),
            ];
            $current_cast_member_id = (string) ($member['id'] ?? '');
        } else {
            $public_member_id = vcs_request_public_member_id($request);
            $workspace = [
                'studioConcept' => vcs_normalize_studio_concept($workspace),
                'recordingProjects' => array_values(array_map(
                    static fn(array $project): array => vcs_filter_project_for_shared_guest($project, $public_member_id),
                    $workspace['recordingProjects'] ?? []
                )),
            ];
            $user = (object) [
                'ID' => 0,
                'display_name' => '全メンバー共通',
            ];
            $access_mode = 'guest';
        }
    } elseif (is_array($workspace) && !$can_manage) {
        $assigned_projects = [];
        foreach (($workspace['recordingProjects'] ?? []) as $project) {
            $character_ids = vcs_user_character_ids($project, (int) $user->ID);
            if (!$character_ids) {
                continue;
            }
            $assigned_projects[] = vcs_filter_project_for_actor($project, (int) $user->ID, $character_ids);
        }
        $workspace = [
            'studioConcept' => vcs_normalize_studio_concept($workspace),
            'recordingProjects' => $assigned_projects,
        ];
    }
    $users = [];
    if ($can_manage) {
        foreach (get_users(['fields' => ['ID', 'display_name']]) as $site_user) {
            $users[] = ['id' => (int) $site_user->ID, 'name' => $site_user->display_name];
        }
    }
    return rest_ensure_response([
        'data' => $workspace,
        'version' => $post ? (int) get_post_meta($post->ID, '_vcs_workspace_version', true) : 0,
        'currentUser' => [
            'id' => (int) $user->ID,
            'name' => $user->display_name,
            'castMemberId' => $current_cast_member_id,
            'accessMode' => $access_mode,
        ],
        'canManage' => $can_manage,
        'canEditScript' => $can_edit_script,
        'users' => $users,
    ]);
}

function vcs_rest_save_workspace(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $params = $request->get_json_params();
    if (!is_array($params) || !isset($params['data']) || !is_array($params['data'])) {
        return new WP_Error('vcs_invalid_workspace', 'A workspace data object is required.', ['status' => 400]);
    }
    $current = vcs_decode_workspace(vcs_get_workspace_post(false));
    if (!current_user_can(VCS_SCRIPT_CAPABILITY)) {
        $incoming_structure = vcs_extract_script_structure($params['data']);
        $current_structure = vcs_extract_script_structure($current);
        if ($incoming_structure !== $current_structure) {
            return new WP_Error(
                'vcs_script_edit_forbidden',
                'Only the production owner can edit scripts and shared production information.',
                ['status' => 403]
            );
        }
    }
    return vcs_write_workspace(vcs_merge_concurrent_actor_data($params['data'], $current));
}

function vcs_is_google_drive_url(string $url): bool
{
    if ('' === $url) {
        return true;
    }
    $host = strtolower((string) wp_parse_url($url, PHP_URL_HOST));
    return in_array($host, ['drive.google.com', 'docs.google.com'], true);
}

function vcs_find_project_index(array $data, string $project_id): int
{
    foreach (($data['recordingProjects'] ?? []) as $index => $project) {
        if (($project['id'] ?? '') === $project_id) {
            return (int) $index;
        }
    }
    return -1;
}

function vcs_user_character_ids(array $project, int $user_id): array
{
    foreach (($project['castMembers'] ?? []) as $member) {
        if ((int) ($member['wpUserId'] ?? 0) === $user_id) {
            return array_values(array_filter(array_map('strval', $member['characterIds'] ?? [])));
        }
    }
    return [];
}

function vcs_question_is_owned_by_actor(array $question, int $user_id, array $share_member = [], string $public_member_id = ''): bool
{
    if ('' !== $public_member_id) {
        $question_public_member_id = (string) ($question['publicMemberId'] ?? '');
        return '' !== $question_public_member_id && hash_equals($question_public_member_id, $public_member_id);
    }
    if ($share_member) {
        $member_id = (string) ($share_member['id'] ?? '');
        $question_member_id = (string) ($question['castMemberId'] ?? '');
        if ('' !== $member_id && $question_member_id === $member_id) {
            return true;
        }
        $member_user_id = (int) ($share_member['wpUserId'] ?? 0);
        return '' === $question_member_id
            && $member_user_id > 0
            && (int) ($question['wpUserId'] ?? 0) === $member_user_id;
    }
    return $user_id > 0 && (int) ($question['wpUserId'] ?? 0) === $user_id;
}

function vcs_merge_concurrent_actor_data(array $incoming, array $current): array
{
    $current_projects = [];
    foreach (($current['recordingProjects'] ?? []) as $project) {
        $current_projects[(string) ($project['id'] ?? '')] = $project;
    }
    foreach (($incoming['recordingProjects'] ?? []) as $project_index => $project) {
        $current_project = $current_projects[(string) ($project['id'] ?? '')] ?? null;
        if (!is_array($current_project)) {
            continue;
        }
        $current_lines = [];
        foreach (($current_project['lines'] ?? []) as $line) {
            $current_lines[(string) ($line['id'] ?? '')] = $line;
        }
        foreach (($project['lines'] ?? []) as $line_index => $line) {
            $current_line = $current_lines[(string) ($line['id'] ?? '')] ?? null;
            if (!is_array($current_line)) {
                continue;
            }
            $incoming_time = strtotime((string) ($line['updatedAt'] ?? '')) ?: 0;
            $current_time = strtotime((string) ($current_line['updatedAt'] ?? '')) ?: 0;
            if ($current_time <= $incoming_time) {
                continue;
            }
            foreach (['actorStatus', 'recordingUrl', 'recordingFileName', 'actorNote', 'updatedAt'] as $key) {
                if (array_key_exists($key, $current_line)) {
                    $incoming['recordingProjects'][$project_index]['lines'][$line_index][$key] = $current_line[$key];
                }
            }
        }

        $incoming_progress = is_array($project['derivedLineProgress'] ?? null)
            ? $project['derivedLineProgress']
            : [];
        foreach (($current_project['derivedLineProgress'] ?? []) as $line_id => $current_progress) {
            if (!is_array($current_progress)) {
                continue;
            }
            $incoming_line = $incoming_progress[$line_id] ?? null;
            if (!is_array($incoming_line)) {
                $incoming['recordingProjects'][$project_index]['derivedLineProgress'][$line_id] = $current_progress;
                continue;
            }
            $incoming_time = strtotime((string) ($incoming_line['updatedAt'] ?? '')) ?: 0;
            $current_time = strtotime((string) ($current_progress['updatedAt'] ?? '')) ?: 0;
            if ($current_time <= $incoming_time) {
                continue;
            }
            foreach (['actorStatus', 'recordingUrl', 'recordingFileName', 'actorNote', 'updatedAt'] as $key) {
                if (array_key_exists($key, $current_progress)) {
                    $incoming['recordingProjects'][$project_index]['derivedLineProgress'][$line_id][$key] = $current_progress[$key];
                }
            }
        }

        $current_questions = [];
        foreach (($current_project['questions'] ?? []) as $question) {
            $current_questions[(string) ($question['id'] ?? '')] = $question;
        }
        foreach (($project['questions'] ?? []) as $question_index => $question) {
            $question_id = (string) ($question['id'] ?? '');
            $current_question = $current_questions[$question_id] ?? null;
            if (!is_array($current_question)) {
                if ('解決済み' === ($question['status'] ?? '')) {
                    $incoming['recordingProjects'][$project_index]['questions'][$question_index]['status'] =
                        '' !== trim((string) ($question['answer'] ?? '')) ? '回答済み' : '未回答';
                }
                continue;
            }

            $incoming_status = (string) ($question['status'] ?? '未回答');
            $current_status = (string) ($current_question['status'] ?? '未回答');
            // Only the questioner endpoint may create a resolved transition.
            if ('解決済み' === $current_status || ('解決済み' === $incoming_status && '解決済み' !== $current_status)) {
                $incoming['recordingProjects'][$project_index]['questions'][$question_index]['status'] = $current_status;
            }

            $incoming_time = strtotime((string) ($question['updatedAt'] ?? '')) ?: 0;
            $current_time = strtotime((string) ($current_question['updatedAt'] ?? '')) ?: 0;
            if ($current_time > $incoming_time) {
                foreach (['status', 'updatedAt'] as $key) {
                    if (array_key_exists($key, $current_question)) {
                        $incoming['recordingProjects'][$project_index]['questions'][$question_index][$key] = $current_question[$key];
                    }
                }
            }
        }

        $incoming_question_ids = [];
        foreach (($project['questions'] ?? []) as $question) {
            $incoming_question_ids[(string) ($question['id'] ?? '')] = true;
        }
        $missing_questions = array_values(array_filter(
            $current_project['questions'] ?? [],
            static fn(array $question): bool => !isset($incoming_question_ids[(string) ($question['id'] ?? '')])
        ));
        if ($missing_questions) {
            $incoming['recordingProjects'][$project_index]['questions'] = array_values(array_merge(
                $missing_questions,
                $project['questions'] ?? []
            ));
        }
    }
    return $incoming;
}

function vcs_rest_update_line(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $params = $request->get_json_params();
    $project_id = sanitize_text_field((string) ($params['projectId'] ?? ''));
    $line_id = sanitize_text_field((string) ($params['lineId'] ?? ''));
    $patch = is_array($params['patch'] ?? null) ? $params['patch'] : [];
    $line_context = is_array($params['lineContext'] ?? null) ? $params['lineContext'] : [];
    $post = vcs_get_workspace_post(false);
    $data = vcs_decode_workspace($post);
    $project_index = vcs_find_project_index($data, $project_id);
    if ($project_index < 0) {
        return new WP_Error('vcs_project_not_found', 'Project not found.', ['status' => 404]);
    }
    $project = $data['recordingProjects'][$project_index];
    $line_index = -1;
    foreach (($project['lines'] ?? []) as $index => $line) {
        if (($line['id'] ?? '') === $line_id) {
            $line_index = (int) $index;
            break;
        }
    }
    $can_manage = current_user_can(VCS_MANAGER_CAPABILITY);
    $is_derived = false;
    if ($line_index < 0) {
        $is_derived = str_starts_with($line_id, 'derived_line_')
            && !empty($line_context['derivedFromManualBody']);
        $source_line_id = sanitize_text_field((string) ($line_context['sourceLineId'] ?? ''));
        $source_line = null;
        foreach (($project['lines'] ?? []) as $candidate) {
            if (($candidate['id'] ?? '') === $source_line_id && !empty($candidate['manualBody'])) {
                $source_line = $candidate;
                break;
            }
        }
        if (!$is_derived || !is_array($source_line)) {
            return new WP_Error('vcs_line_not_found', 'Line not found.', ['status' => 404]);
        }

        $character_id = sanitize_text_field((string) ($line_context['characterId'] ?? ''));
        $character_exists = false;
        foreach (($project['characters'] ?? []) as $character) {
            if (($character['id'] ?? '') === $character_id) {
                $character_exists = true;
                break;
            }
        }
        if (!$character_exists) {
            return new WP_Error('vcs_character_not_found', 'Character not found.', ['status' => 404]);
        }

        $stored_progress = is_array($project['derivedLineProgress'][$line_id] ?? null)
            ? $project['derivedLineProgress'][$line_id]
            : [];
        $performance_type = sanitize_text_field((string) ($line_context['performanceType'] ?? '通常'));
        if (!in_array($performance_type, ['通常', 'ナレーション', '心の声', 'イヤモニ'], true)) {
            $performance_type = '通常';
        }
        $line = array_merge([
            'id' => $line_id,
            'sourceLineId' => $source_line_id,
            'characterId' => $character_id,
            'chapterId' => (string) ($source_line['chapterId'] ?? ''),
            'sceneId' => (string) ($source_line['sceneId'] ?? ''),
            'performanceType' => $performance_type,
            'actorStatus' => '未収録',
            'reviewStatus' => '未確認',
            'recordingUrl' => '',
            'recordingFileName' => '',
            'actorNote' => '',
            'directorNote' => '',
            'updatedAt' => '',
        ], $stored_progress);
    } else {
        $line = $project['lines'][$line_index];
    }
    if (!$can_manage) {
        $share_context = !is_user_logged_in() ? vcs_get_share_context($request, $data) : null;
        $is_public_guest = !is_user_logged_in()
            && !$share_context
            && vcs_request_has_public_collaboration_access($request);
        if ($share_context && (string) ($share_context['project']['id'] ?? '') !== $project_id) {
            return new WP_Error('vcs_line_forbidden', 'This line is not assigned to this shared link.', ['status' => 403]);
        }
        $character_ids = $share_context
            ? $share_context['characterIds']
            : vcs_user_character_ids($project, get_current_user_id());
        if (!$is_public_guest && !in_array((string) ($line['characterId'] ?? ''), $character_ids, true)) {
            return new WP_Error('vcs_line_forbidden', 'This line is not assigned to the current user.', ['status' => 403]);
        }
    }

    $allowed = $can_manage
        ? ['actorStatus', 'reviewStatus', 'recordingUrl', 'recordingFileName', 'actorNote', 'directorNote']
        : (!empty($is_public_guest)
            ? ['actorStatus']
            : ['actorStatus', 'recordingUrl', 'recordingFileName', 'actorNote']);
    $controlled_fields = ['actorStatus', 'reviewStatus', 'recordingUrl', 'recordingFileName', 'actorNote', 'directorNote'];
    $requested_controlled_fields = array_values(array_intersect(array_keys($patch), $controlled_fields));
    $forbidden_fields = array_values(array_diff($requested_controlled_fields, $allowed));
    if ($forbidden_fields) {
        return new WP_Error(
            'vcs_line_fields_forbidden',
            'この画面から変更できない制作管理項目が含まれています。',
            ['status' => 403]
        );
    }
    foreach ($allowed as $key) {
        if (!array_key_exists($key, $patch)) {
            continue;
        }
        if ('recordingUrl' === $key) {
            $url = esc_url_raw((string) $patch[$key]);
            if (!vcs_is_google_drive_url($url)) {
                return new WP_Error('vcs_drive_url_required', 'Recording URLs must point to Google Drive.', ['status' => 400]);
            }
            $line[$key] = $url;
        } elseif ('actorStatus' === $key) {
            $status = sanitize_text_field((string) $patch[$key]);
            if (!in_array($status, ['未収録', '収録済み', '再提出済み'], true)) {
                return new WP_Error('vcs_actor_status_invalid', 'Actor status is invalid.', ['status' => 400]);
            }
            $line[$key] = $status;
        } elseif ('reviewStatus' === $key) {
            $status = sanitize_text_field((string) $patch[$key]);
            if (!in_array($status, ['未確認', '確認中', 'OK', 'リテイク', '保留'], true)) {
                return new WP_Error('vcs_review_status_invalid', 'Review status is invalid.', ['status' => 400]);
            }
            $line[$key] = $status;
        } else {
            $line[$key] = sanitize_textarea_field((string) $patch[$key]);
        }
    }
    $line['updatedAt'] = current_time('c');
    if ($is_derived) {
        if (!isset($data['recordingProjects'][$project_index]['derivedLineProgress'])
            || !is_array($data['recordingProjects'][$project_index]['derivedLineProgress'])) {
            $data['recordingProjects'][$project_index]['derivedLineProgress'] = [];
        }
        $data['recordingProjects'][$project_index]['derivedLineProgress'][$line_id] = $line;
    } else {
        $data['recordingProjects'][$project_index]['lines'][$line_index] = $line;
    }
    $write = vcs_write_workspace($data);
    if (is_wp_error($write)) {
        return $write;
    }
    return rest_ensure_response(['ok' => true, 'line' => $line, 'derived' => $is_derived]);
}

function vcs_rest_update_lines_bulk(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $params = $request->get_json_params();
    $project_id = sanitize_text_field((string) ($params['projectId'] ?? ''));
    $updates = is_array($params['updates'] ?? null) ? array_values($params['updates']) : [];
    $actor_status = sanitize_text_field((string) ($params['actorStatus'] ?? ''));
    if ('' === $project_id || !$updates || count($updates) > 500) {
        return new WP_Error('vcs_bulk_line_request_invalid', 'まとめて更新するセリフを確認してください。', ['status' => 400]);
    }
    if (!in_array($actor_status, ['未収録', '収録済み', '再提出済み'], true)) {
        return new WP_Error('vcs_actor_status_invalid', 'Actor status is invalid.', ['status' => 400]);
    }

    $post = vcs_get_workspace_post(false);
    $data = vcs_decode_workspace($post);
    $project_index = vcs_find_project_index($data, $project_id);
    if ($project_index < 0) {
        return new WP_Error('vcs_project_not_found', 'Project not found.', ['status' => 404]);
    }
    $project = $data['recordingProjects'][$project_index];
    $can_manage = current_user_can(VCS_MANAGER_CAPABILITY);
    $share_context = !$can_manage && !is_user_logged_in() ? vcs_get_share_context($request, $data) : null;
    $is_public_guest = !$can_manage
        && !is_user_logged_in()
        && !$share_context
        && vcs_request_has_public_collaboration_access($request);
    if ($share_context && (string) ($share_context['project']['id'] ?? '') !== $project_id) {
        return new WP_Error('vcs_line_forbidden', 'This project is not assigned to this shared link.', ['status' => 403]);
    }
    $character_ids = $share_context
        ? $share_context['characterIds']
        : vcs_user_character_ids($project, get_current_user_id());
    $updated_at = current_time('c');
    $updated_lines = [];
    $seen_line_ids = [];

    foreach ($updates as $update) {
        if (!is_array($update)) {
            continue;
        }
        $line_id = sanitize_text_field((string) ($update['lineId'] ?? ''));
        if ('' === $line_id || isset($seen_line_ids[$line_id])) {
            continue;
        }
        $seen_line_ids[$line_id] = true;
        $line_context = is_array($update['lineContext'] ?? null) ? $update['lineContext'] : [];
        $line_index = -1;
        foreach (($project['lines'] ?? []) as $index => $candidate) {
            if (($candidate['id'] ?? '') === $line_id) {
                $line_index = (int) $index;
                break;
            }
        }

        $is_derived = false;
        if ($line_index < 0) {
            $is_derived = str_starts_with($line_id, 'derived_line_')
                && !empty($line_context['derivedFromManualBody']);
            $source_line_id = sanitize_text_field((string) ($line_context['sourceLineId'] ?? ''));
            $source_line = null;
            foreach (($project['lines'] ?? []) as $candidate) {
                if (($candidate['id'] ?? '') === $source_line_id && !empty($candidate['manualBody'])) {
                    $source_line = $candidate;
                    break;
                }
            }
            if (!$is_derived || !is_array($source_line)) {
                return new WP_Error('vcs_line_not_found', 'Line not found.', ['status' => 404]);
            }

            $character_id = sanitize_text_field((string) ($line_context['characterId'] ?? ''));
            $character_exists = false;
            foreach (($project['characters'] ?? []) as $character) {
                if (($character['id'] ?? '') === $character_id) {
                    $character_exists = true;
                    break;
                }
            }
            if (!$character_exists) {
                return new WP_Error('vcs_character_not_found', 'Character not found.', ['status' => 404]);
            }

            $stored_progress = is_array($project['derivedLineProgress'][$line_id] ?? null)
                ? $project['derivedLineProgress'][$line_id]
                : [];
            $performance_type = sanitize_text_field((string) ($line_context['performanceType'] ?? '通常'));
            if (!in_array($performance_type, ['通常', 'ナレーション', '心の声', 'イヤモニ'], true)) {
                $performance_type = '通常';
            }
            $line = array_merge([
                'id' => $line_id,
                'sourceLineId' => $source_line_id,
                'characterId' => $character_id,
                'chapterId' => (string) ($source_line['chapterId'] ?? ''),
                'sceneId' => (string) ($source_line['sceneId'] ?? ''),
                'performanceType' => $performance_type,
                'actorStatus' => '未収録',
                'reviewStatus' => '未確認',
                'recordingUrl' => '',
                'recordingFileName' => '',
                'actorNote' => '',
                'directorNote' => '',
                'updatedAt' => '',
            ], $stored_progress);
        } else {
            $line = $project['lines'][$line_index];
        }

        if (!$can_manage && !$is_public_guest && !in_array((string) ($line['characterId'] ?? ''), $character_ids, true)) {
            return new WP_Error('vcs_line_forbidden', 'This line is not assigned to the current user.', ['status' => 403]);
        }

        $line['actorStatus'] = $actor_status;
        $line['updatedAt'] = $updated_at;
        if ($is_derived) {
            if (!isset($data['recordingProjects'][$project_index]['derivedLineProgress'])
                || !is_array($data['recordingProjects'][$project_index]['derivedLineProgress'])) {
                $data['recordingProjects'][$project_index]['derivedLineProgress'] = [];
            }
            $data['recordingProjects'][$project_index]['derivedLineProgress'][$line_id] = $line;
        } else {
            $data['recordingProjects'][$project_index]['lines'][$line_index] = $line;
        }
        $updated_lines[] = $line;
    }

    if (!$updated_lines) {
        return new WP_Error('vcs_bulk_line_request_empty', '更新対象のセリフがありません。', ['status' => 400]);
    }
    $write = vcs_write_workspace($data);
    if (is_wp_error($write)) {
        return $write;
    }
    return rest_ensure_response([
        'ok' => true,
        'count' => count($updated_lines),
        'lines' => $updated_lines,
        'updatedAt' => $updated_at,
    ]);
}

function vcs_rest_create_question(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $params = $request->get_json_params();
    $project_id = sanitize_text_field((string) ($params['projectId'] ?? ''));
    $line_id = sanitize_text_field((string) ($params['lineId'] ?? ''));
    $parent_question_id = sanitize_text_field((string) ($params['parentQuestionId'] ?? ''));
    $body = sanitize_textarea_field((string) ($params['body'] ?? ''));
    if ('' === $body) {
        return new WP_Error('vcs_question_required', 'Question text is required.', ['status' => 400]);
    }
    $post = vcs_get_workspace_post(false);
    $data = vcs_decode_workspace($post);
    $project_index = vcs_find_project_index($data, $project_id);
    if ($project_index < 0) {
        return new WP_Error('vcs_project_not_found', 'Project not found.', ['status' => 404]);
    }
    $project = $data['recordingProjects'][$project_index];
    $can_manage = current_user_can(VCS_MANAGER_CAPABILITY);
    $share_context = !$can_manage && !is_user_logged_in() ? vcs_get_share_context($request, $data) : null;
    $public_member_id = !$can_manage && !is_user_logged_in() && !$share_context
        ? vcs_request_public_member_id($request)
        : '';
    $is_public_guest = '' !== $public_member_id && vcs_request_has_public_collaboration_access($request);
    if ($share_context && (string) ($share_context['project']['id'] ?? '') !== $project_id) {
        return new WP_Error('vcs_question_forbidden', 'This project is not assigned to this shared link.', ['status' => 403]);
    }
    $character_ids = $is_public_guest
        ? array_values(array_filter(array_map(
            static fn(array $character): string => (string) ($character['id'] ?? ''),
            array_filter($project['characters'] ?? [], 'is_array')
        )))
        : ($share_context
            ? $share_context['characterIds']
            : vcs_user_character_ids($project, get_current_user_id()));
    if (!$can_manage && !$is_public_guest && !$character_ids) {
        return new WP_Error('vcs_question_forbidden', 'This project is not assigned to the current user.', ['status' => 403]);
    }
    $parent_question = null;
    if ('' !== $parent_question_id) {
        foreach (($project['questions'] ?? []) as $candidate) {
            if ((string) ($candidate['id'] ?? '') === $parent_question_id) {
                $parent_question = $candidate;
                break;
            }
        }
        if (!is_array($parent_question)) {
            return new WP_Error('vcs_parent_question_not_found', 'The previous question could not be found.', ['status' => 404]);
        }
        $share_member = $share_context['member'] ?? [];
        if (!$can_manage && !vcs_question_is_owned_by_actor($parent_question, get_current_user_id(), $share_member, $public_member_id)) {
            return new WP_Error('vcs_follow_up_forbidden', 'Only the original questioner can add a follow-up.', ['status' => 403]);
        }
        if ('' === trim((string) ($parent_question['answer'] ?? ''))) {
            return new WP_Error('vcs_follow_up_not_answered', 'A follow-up can be added after the previous question is answered.', ['status' => 409]);
        }
        $line_id = (string) ($parent_question['lineId'] ?? '');
    }
    $character_id = '';
    $line_found = '' === $line_id;
    foreach (($project['lines'] ?? []) as $line) {
        if (($line['id'] ?? '') === $line_id) {
            $character_id = (string) ($line['characterId'] ?? '');
            $line_found = true;
            break;
        }
    }
    if (!$line_found) {
        return new WP_Error('vcs_line_not_found', 'Line not found.', ['status' => 404]);
    }
    if (!$can_manage && '' !== $character_id && !in_array($character_id, $character_ids, true)) {
        return new WP_Error('vcs_question_forbidden', 'Questions can only be linked to assigned lines.', ['status' => 403]);
    }
    $user = wp_get_current_user();
    $share_member = $share_context['member'] ?? [];
    $requested_author_name = trim(sanitize_text_field((string) ($params['authorName'] ?? '')));
    $public_author_name = '' !== $requested_author_name
        ? $requested_author_name
        : 'メンバー';
    $now = current_time('c');
    $question = [
        'id' => 'question_' . wp_generate_uuid4(),
        'lineId' => $line_id,
        'characterId' => $character_id,
        'authorName' => $share_context
            ? (string) ($share_member['actorName'] ?? '声優さん')
            : ($is_public_guest ? $public_author_name : $user->display_name),
        'wpUserId' => (int) $user->ID,
        'castMemberId' => $share_context ? (string) ($share_member['id'] ?? '') : '',
        'publicMemberId' => $is_public_guest ? $public_member_id : '',
        'parentQuestionId' => $parent_question_id,
        'body' => $body,
        'answer' => '',
        'status' => '未回答',
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    if (!isset($data['recordingProjects'][$project_index]['questions']) || !is_array($data['recordingProjects'][$project_index]['questions'])) {
        $data['recordingProjects'][$project_index]['questions'] = [];
    }
    array_unshift($data['recordingProjects'][$project_index]['questions'], $question);
    $write = vcs_write_workspace($data);
    if (is_wp_error($write)) {
        return $write;
    }
    if ($is_public_guest) {
        unset($question['wpUserId'], $question['castMemberId'], $question['publicMemberId']);
        $question['isOwnedByCurrentVisitor'] = true;
    }
    return rest_ensure_response(['ok' => true, 'question' => $question]);
}

function vcs_rest_resolve_question(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $params = $request->get_json_params();
    $project_id = sanitize_text_field((string) ($params['projectId'] ?? ''));
    $question_id = sanitize_text_field((string) ($params['questionId'] ?? ''));
    if ('' === $project_id || '' === $question_id) {
        return new WP_Error('vcs_question_resolve_required', 'Project and question IDs are required.', ['status' => 400]);
    }

    $post = vcs_get_workspace_post(false);
    $data = vcs_decode_workspace($post);
    $project_index = vcs_find_project_index($data, $project_id);
    if ($project_index < 0) {
        return new WP_Error('vcs_project_not_found', 'Project not found.', ['status' => 404]);
    }

    $question_index = -1;
    foreach (($data['recordingProjects'][$project_index]['questions'] ?? []) as $index => $question) {
        if (($question['id'] ?? '') === $question_id) {
            $question_index = (int) $index;
            break;
        }
    }
    if ($question_index < 0) {
        return new WP_Error('vcs_question_not_found', 'Question not found.', ['status' => 404]);
    }

    $question = $data['recordingProjects'][$project_index]['questions'][$question_index];
    $share_context = !is_user_logged_in() ? vcs_get_share_context($request, $data) : null;
    $share_member = $share_context['member'] ?? [];
    $public_member_id = !is_user_logged_in() && !$share_context
        ? vcs_request_public_member_id($request)
        : '';
    $is_correct_project = !$share_context || (string) ($share_context['project']['id'] ?? '') === $project_id;
    if (!$is_correct_project || !vcs_question_is_owned_by_actor($question, get_current_user_id(), $share_member, $public_member_id)) {
        return new WP_Error('vcs_question_resolve_forbidden', 'Only the person who asked this question can resolve it.', ['status' => 403]);
    }
    if ('解決済み' === ($question['status'] ?? '')) {
        return rest_ensure_response(['ok' => true, 'question' => $question]);
    }
    if ('回答済み' !== ($question['status'] ?? '') || '' === trim((string) ($question['answer'] ?? ''))) {
        return new WP_Error('vcs_question_not_answered', 'This question has not been answered yet.', ['status' => 409]);
    }

    $question['status'] = '解決済み';
    $question['updatedAt'] = current_time('c');
    $data['recordingProjects'][$project_index]['questions'][$question_index] = $question;
    $write = vcs_write_workspace($data);
    if (is_wp_error($write)) {
        return $write;
    }
    if ('' !== $public_member_id) {
        unset($question['wpUserId'], $question['castMemberId'], $question['publicMemberId']);
        $question['isOwnedByCurrentVisitor'] = true;
    }
    return rest_ensure_response(['ok' => true, 'question' => $question]);
}

function vcs_rest_get_audition_automation_settings(): WP_REST_Response
{
    return rest_ensure_response(vcs_safe_audition_automation_settings());
}

function vcs_rest_save_audition_automation_settings(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $params = $request->get_json_params();
    if (!is_array($params)) {
        return new WP_Error('vcs_audition_settings_required', '設定内容を読み取れませんでした。', ['status' => 400]);
    }
    $settings = vcs_get_audition_automation_option();

    if (!empty($params['clearOpenAiApiKey'])) {
        unset($settings['openAiApiKey']);
    }
    if (array_key_exists('openAiApiKey', $params) && '' !== trim((string) $params['openAiApiKey'])) {
        $api_key = trim((string) $params['openAiApiKey']);
        if (!preg_match('/^sk-[A-Za-z0-9_-]{20,}$/', $api_key)) {
            return new WP_Error('vcs_openai_key_invalid', 'OpenAI APIキーの形式を確認してください。', ['status' => 400]);
        }
        $encrypted = vcs_encrypt_secret($api_key);
        if (is_wp_error($encrypted)) {
            return $encrypted;
        }
        $settings['openAiApiKey'] = $encrypted;
    }

    // These integration values are accepted only from the owner setup panel and
    // are returned to the browser only as a configured/not-configured flag.
    if (array_key_exists('appsScriptWebAppUrl', $params) && '' !== trim((string) $params['appsScriptWebAppUrl'])) {
        $url = esc_url_raw(trim((string) $params['appsScriptWebAppUrl']));
        $host = strtolower((string) wp_parse_url($url, PHP_URL_HOST));
        if ('https' !== wp_parse_url($url, PHP_URL_SCHEME) || 'script.google.com' !== $host) {
            return new WP_Error('vcs_apps_script_url_invalid', 'Google Apps ScriptのURLが正しくありません。', ['status' => 400]);
        }
        $encrypted = vcs_encrypt_secret($url);
        if (is_wp_error($encrypted)) {
            return $encrypted;
        }
        $settings['appsScriptWebAppUrl'] = $encrypted;
    }
    if (array_key_exists('appsScriptSecret', $params) && '' !== trim((string) $params['appsScriptSecret'])) {
        $secret = trim((string) $params['appsScriptSecret']);
        if (strlen($secret) < 32) {
            return new WP_Error('vcs_apps_script_secret_invalid', 'Google連携用の秘密文字列が短すぎます。', ['status' => 400]);
        }
        $encrypted = vcs_encrypt_secret($secret);
        if (is_wp_error($encrypted)) {
            return $encrypted;
        }
        $settings['appsScriptSecret'] = $encrypted;
    }

    $settings['updatedAt'] = current_time('c');
    update_option(VCS_AUDITION_AUTOMATION_OPTION, $settings, false);
    return rest_ensure_response(vcs_safe_audition_automation_settings($settings));
}

function vcs_load_audition_image(string $source): array|WP_Error
{
    $source = trim($source);
    if ('' === $source) {
        return new WP_Error('vcs_character_image_required', '先にキャラクター画像を登録してください。', ['status' => 409]);
    }
    $bytes = '';
    $mime_type = '';
    if (str_starts_with($source, 'data:')) {
        if (!preg_match('#^data:(image/(?:png|jpeg|webp));base64,(.+)$#s', $source, $matches)) {
            return new WP_Error('vcs_character_image_invalid', 'キャラクター画像の形式を読み取れませんでした。', ['status' => 400]);
        }
        $mime_type = $matches[1];
        $bytes = base64_decode($matches[2], true);
        if (!is_string($bytes)) {
            return new WP_Error('vcs_character_image_invalid', 'キャラクター画像を読み取れませんでした。', ['status' => 400]);
        }
    } else {
        $url = str_starts_with($source, '/') ? home_url($source) : esc_url_raw($source);
        $source_host = strtolower((string) wp_parse_url($url, PHP_URL_HOST));
        $site_host = strtolower((string) wp_parse_url(home_url('/'), PHP_URL_HOST));
        if ('https' !== wp_parse_url($url, PHP_URL_SCHEME) || $site_host !== $source_host) {
            return new WP_Error('vcs_character_image_host', '自動作成には、このサイトへ登録したキャラクター画像を使用してください。', ['status' => 400]);
        }
        $response = wp_safe_remote_get($url, [
            'timeout' => 30,
            'redirection' => 3,
            'limit_response_size' => 12 * MB_IN_BYTES,
        ]);
        if (is_wp_error($response)) {
            return new WP_Error('vcs_character_image_fetch', 'キャラクター画像を取得できませんでした。', ['status' => 502]);
        }
        if (200 !== wp_remote_retrieve_response_code($response)) {
            return new WP_Error('vcs_character_image_fetch', 'キャラクター画像を取得できませんでした。', ['status' => 502]);
        }
        $bytes = wp_remote_retrieve_body($response);
        $mime_type = strtolower(trim(explode(';', (string) wp_remote_retrieve_header($response, 'content-type'))[0]));
    }
    if (!is_string($bytes) || '' === $bytes || strlen($bytes) > 12 * MB_IN_BYTES) {
        return new WP_Error('vcs_character_image_size', 'キャラクター画像が大きすぎるか、空です。', ['status' => 400]);
    }
    $image_info = @getimagesizefromstring($bytes);
    if (!is_array($image_info)) {
        return new WP_Error('vcs_character_image_invalid', 'キャラクター画像として読み取れませんでした。', ['status' => 400]);
    }
    $detected_mime = image_type_to_mime_type((int) ($image_info[2] ?? 0));
    if (in_array($detected_mime, ['image/png', 'image/jpeg', 'image/webp'], true)) {
        $mime_type = $detected_mime;
    }
    return [
        'bytes' => $bytes,
        'mimeType' => $mime_type,
        'fileName' => 'character.' . ('image/jpeg' === $mime_type ? 'jpg' : ('image/webp' === $mime_type ? 'webp' : 'png')),
    ];
}

function vcs_get_audition_logo_image(): array|WP_Error
{
    $logo_path = get_template_directory() . '/assets/assets/umbrella-parade-audition-logo.png';
    if (!is_readable($logo_path)) {
        $logo_path = get_template_directory() . '/assets/assets/umbrella-parade-concept-logo.png';
    }
    $bytes = is_readable($logo_path) ? file_get_contents($logo_path) : false;
    if (!is_string($bytes) || '' === $bytes) {
        return new WP_Error('vcs_audition_logo_missing', 'Umbrella Paradeロゴを読み込めませんでした。', ['status' => 500]);
    }
    return ['bytes' => $bytes, 'mimeType' => 'image/png', 'fileName' => 'umbrella-parade-logo.png'];
}

function vcs_openai_multipart_body(array $fields, array $images): array
{
    $boundary = '----VCS' . bin2hex(random_bytes(18));
    $body = '';
    foreach ($fields as $name => $value) {
        $body .= '--' . $boundary . "\r\n";
        $body .= 'Content-Disposition: form-data; name="' . $name . '"' . "\r\n\r\n";
        $body .= (string) $value . "\r\n";
    }
    foreach ($images as $image) {
        $file_name = str_replace(['"', "\r", "\n"], '', (string) ($image['fileName'] ?? 'image.png'));
        $body .= '--' . $boundary . "\r\n";
        $body .= 'Content-Disposition: form-data; name="image[]"; filename="' . $file_name . '"' . "\r\n";
        $body .= 'Content-Type: ' . (string) ($image['mimeType'] ?? 'image/png') . "\r\n\r\n";
        $body .= (string) ($image['bytes'] ?? '') . "\r\n";
    }
    $body .= '--' . $boundary . "--\r\n";
    return ['body' => $body, 'contentType' => 'multipart/form-data; boundary=' . $boundary];
}

function vcs_generate_audition_image(string $api_key, string $prompt, string $size, array $images): array|WP_Error
{
    try {
        $multipart = vcs_openai_multipart_body([
            'model' => VCS_AUDITION_OPENAI_MODEL,
            'prompt' => $prompt,
            'size' => $size,
            'quality' => 'medium',
            'output_format' => 'png',
        ], $images);
    } catch (Throwable $error) {
        return new WP_Error('vcs_openai_request_build', '画像生成リクエストを準備できませんでした。', ['status' => 500]);
    }
    $response = wp_remote_post('https://api.openai.com/v1/images/edits', [
        'timeout' => 180,
        'redirection' => 0,
        'httpversion' => '1.1',
        'headers' => [
            'Authorization' => 'Bearer ' . $api_key,
            'Content-Type' => $multipart['contentType'],
        ],
        'body' => $multipart['body'],
        'data_format' => 'body',
    ]);
    if (is_wp_error($response)) {
        return new WP_Error('vcs_openai_unreachable', 'OpenAIへ接続できませんでした。時間をおいて再度お試しください。', ['status' => 502]);
    }
    $status = wp_remote_retrieve_response_code($response);
    $payload = json_decode(wp_remote_retrieve_body($response), true);
    if ($status < 200 || $status >= 300 || !is_array($payload)) {
        $message = sanitize_text_field((string) ($payload['error']['message'] ?? '画像生成に失敗しました。'));
        if (401 === $status) {
            $message = 'OpenAI APIキーを確認してください。';
        }
        return new WP_Error('vcs_openai_error', $message, ['status' => 502]);
    }
    $base64 = (string) ($payload['data'][0]['b64_json'] ?? '');
    $bytes = base64_decode($base64, true);
    if (!is_string($bytes) || '' === $bytes) {
        return new WP_Error('vcs_openai_empty_image', 'OpenAIから画像データを受け取れませんでした。', ['status' => 502]);
    }
    return ['base64' => $base64, 'bytes' => $bytes, 'mimeType' => 'image/png'];
}

function vcs_crop_audition_header(array $generated): array|WP_Error
{
    require_once ABSPATH . 'wp-admin/includes/image.php';
    $source_path = wp_tempnam('vcs-audition-header-source.png');
    if (!$source_path || false === file_put_contents($source_path, $generated['bytes'])) {
        return new WP_Error('vcs_header_temp_failed', 'ヘッダー画像を整形できませんでした。', ['status' => 500]);
    }
    $output_path = $source_path . '.png';
    try {
        $editor = wp_get_image_editor($source_path);
        if (is_wp_error($editor)) {
            return new WP_Error('vcs_header_editor_failed', 'サーバーでヘッダー画像を整形できませんでした。', ['status' => 500]);
        }
        $size = $editor->get_size();
        $source_width = (int) ($size['width'] ?? 0);
        $source_height = (int) ($size['height'] ?? 0);
        if ($source_width < 1 || $source_height < 1) {
            return new WP_Error('vcs_header_size_failed', '生成画像の大きさを確認できませんでした。', ['status' => 500]);
        }
        $crop_width = $source_width;
        $crop_height = (int) round($crop_width / 4);
        if ($crop_height > $source_height) {
            $crop_height = $source_height;
            $crop_width = (int) round($crop_height * 4);
        }
        $source_x = max(0, (int) floor(($source_width - $crop_width) / 2));
        $source_y = max(0, (int) floor(($source_height - $crop_height) / 2));
        $cropped = $editor->crop($source_x, $source_y, $crop_width, $crop_height, 1600, 400, false);
        if (is_wp_error($cropped)) {
            return new WP_Error('vcs_header_crop_failed', 'ヘッダー画像を1600×400に整形できませんでした。', ['status' => 500]);
        }
        $saved = $editor->save($output_path, 'image/png');
        if (is_wp_error($saved)) {
            return new WP_Error('vcs_header_save_failed', 'ヘッダー画像を保存できませんでした。', ['status' => 500]);
        }
        $bytes = file_get_contents((string) ($saved['path'] ?? $output_path));
        if (!is_string($bytes) || '' === $bytes) {
            return new WP_Error('vcs_header_save_failed', 'ヘッダー画像を読み出せませんでした。', ['status' => 500]);
        }
        return ['base64' => base64_encode($bytes), 'bytes' => $bytes, 'mimeType' => 'image/png'];
    } finally {
        if (is_file($source_path)) unlink($source_path);
        if (is_file($output_path)) unlink($output_path);
    }
}

function vcs_openai_response_text(array $payload): string
{
    if (is_string($payload['output_text'] ?? null)) {
        return trim($payload['output_text']);
    }
    foreach (($payload['output'] ?? []) as $output) {
        if (!is_array($output) || 'message' !== ($output['type'] ?? '')) continue;
        foreach (($output['content'] ?? []) as $content) {
            if (is_array($content)
                && 'output_text' === ($content['type'] ?? '')
                && is_string($content['text'] ?? null)) {
                return trim($content['text']);
            }
        }
    }
    return '';
}

function vcs_accent_research_text(mixed $value, int $max_length = 500): string
{
    $text = sanitize_textarea_field((string) $value);
    $text = preg_replace('/[ \t]+/u', ' ', $text);
    $text = preg_replace('/\n{3,}/u', "\n\n", (string) $text);
    $text = trim((string) $text);
    return function_exists('mb_substr') ? mb_substr($text, 0, $max_length) : substr($text, 0, $max_length);
}

function vcs_accent_research_url(mixed $value): string
{
    $url = esc_url_raw(trim((string) $value), ['http', 'https']);
    $scheme = strtolower((string) wp_parse_url($url, PHP_URL_SCHEME));
    $host = (string) wp_parse_url($url, PHP_URL_HOST);
    return in_array($scheme, ['http', 'https'], true) && '' !== $host ? $url : '';
}

function vcs_collect_openai_web_sources(array $payload): array
{
    $sources = [];
    $seen = [];
    $visit = function (mixed $value) use (&$visit, &$sources, &$seen): void {
        if (!is_array($value)) return;
        if (isset($value['url'])) {
            $url = vcs_accent_research_url($value['url']);
            if ('' !== $url && empty($seen[$url])) {
                $seen[$url] = true;
                $title = vcs_accent_research_text($value['title'] ?? $value['name'] ?? '', 160);
                $sources[] = ['title' => $title, 'url' => $url];
            }
        }
        foreach ($value as $child) {
            if (is_array($child)) $visit($child);
        }
    };
    $visit($payload['output'] ?? []);
    return array_slice($sources, 0, 12);
}

function vcs_normalize_accent_research_result(array $raw, array $api_sources, string $query): array
{
    $confidence = (string) ($raw['confidence'] ?? 'low');
    if (!in_array($confidence, ['high', 'medium', 'low'], true)) $confidence = 'low';

    $candidates = [];
    foreach (($raw['candidates'] ?? []) as $candidate) {
        if (!is_array($candidate)) continue;
        $normalized = [
            'label' => vcs_accent_research_text($candidate['label'] ?? '', 100),
            'reading' => vcs_accent_research_text($candidate['reading'] ?? '', 100),
            'notation' => vcs_accent_research_text($candidate['notation'] ?? '', 120),
            'accentType' => vcs_accent_research_text($candidate['accentType'] ?? '', 80),
            'usage' => vcs_accent_research_text($candidate['usage'] ?? '', 260),
        ];
        if ('' === $normalized['reading'] && '' === $normalized['notation'] && '' === $normalized['accentType']) continue;
        $candidates[] = $normalized;
        if (count($candidates) >= 5) break;
    }

    $sources = [];
    $seen = [];
    $source_rows = array_merge(is_array($raw['sources'] ?? null) ? $raw['sources'] : [], $api_sources);
    foreach ($source_rows as $source) {
        if (!is_array($source)) continue;
        $url = vcs_accent_research_url($source['url'] ?? '');
        if ('' === $url || !empty($seen[$url])) continue;
        $seen[$url] = true;
        $sources[] = [
            'title' => vcs_accent_research_text($source['title'] ?? '', 160),
            'url' => $url,
        ];
        if (count($sources) >= 8) break;
    }

    $found = !empty($raw['found']) && !empty($candidates);
    return [
        'query' => $query,
        'found' => $found,
        'summary' => vcs_accent_research_text($raw['summary'] ?? '', 800),
        'confidence' => $confidence,
        'candidates' => $candidates,
        'sources' => $sources,
        'note' => vcs_accent_research_text($raw['note'] ?? '', 500),
    ];
}

function vcs_accent_research_identity(WP_REST_Request $request): string
{
    $user_id = get_current_user_id();
    if ($user_id > 0) return 'user:' . $user_id;

    $share = vcs_request_share_reference($request);
    if ('' !== $share['memberId']) return 'share:' . $share['memberId'];

    $public_member = vcs_request_public_member_id($request);
    if ('' !== $public_member) return 'public:' . $public_member;

    return 'anonymous:' . sanitize_text_field((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
}

function vcs_consume_accent_research_limit(WP_REST_Request $request): bool|WP_Error
{
    $identity = vcs_accent_research_identity($request);
    $ip = sanitize_text_field((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $hour_bucket = gmdate('YmdH');
    $day_bucket = gmdate('Ymd');
    $checks = [
        ['key' => 'identity|' . $identity . '|' . $hour_bucket, 'limit' => VCS_ACCENT_RESEARCH_HOURLY_LIMIT, 'ttl' => HOUR_IN_SECONDS + 120],
        ['key' => 'ip|' . $ip . '|' . $hour_bucket, 'limit' => VCS_ACCENT_RESEARCH_HOURLY_LIMIT * 3, 'ttl' => HOUR_IN_SECONDS + 120],
        ['key' => 'site|' . $day_bucket, 'limit' => VCS_ACCENT_RESEARCH_DAILY_LIMIT, 'ttl' => DAY_IN_SECONDS + 120],
    ];

    foreach ($checks as $check) {
        $transient_key = 'vcs_acc_' . md5((string) $check['key']);
        $count = (int) get_transient($transient_key);
        if ($count >= (int) $check['limit']) {
            return new WP_Error(
                'vcs_accent_research_rate_limited',
                'Web検索の利用回数が一時的な上限に達しました。時間をおいてもう一度お試しください。',
                ['status' => 429]
            );
        }
    }

    foreach ($checks as $check) {
        $transient_key = 'vcs_acc_' . md5((string) $check['key']);
        set_transient($transient_key, (int) get_transient($transient_key) + 1, (int) $check['ttl']);
    }
    return true;
}

function vcs_rest_accent_research(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $query = vcs_accent_research_text(wp_unslash((string) $request->get_param('query')), 80);
    $query = preg_replace('/\s+/u', ' ', $query);
    $query = trim((string) $query);
    if ('' === $query) {
        return new WP_Error('vcs_accent_query_required', '調べる単語を入力してください。', ['status' => 400]);
    }

    $settings = vcs_get_audition_automation_option();
    $api_key = vcs_get_audition_automation_secret($settings, 'openAiApiKey');
    if ('' === $api_key) {
        return new WP_Error(
            'vcs_accent_openai_key_missing',
            'Web検索機能は準備中です。制作オーナーが設定画面でOpenAI APIキーを保存してください。',
            ['status' => 503]
        );
    }

    $rate_limit = vcs_consume_accent_research_limit($request);
    if (is_wp_error($rate_limit)) return $rate_limit;

    $query_json = wp_json_encode($query, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $prompt = <<<PROMPT
あなたは、日本語の標準語アクセントを公開情報から調査する編集者です。
次の語句について必ずWeb検索を行い、大学・研究機関、放送や発音教育の資料、信頼できる辞書・言語資料を優先して複数の情報を照合してください。

調べる語句: {$query_json}

ルール:
- 検索結果にアクセントを明示した根拠がない場合は推測で断定せず、foundをfalseにする。
- 同音異義語、品詞、固有名詞、地域差、文脈による違いがあれば候補を分ける。
- readingはカタカナで書く。
- notationは、アクセント核の直後に「＼」を入れる。平板型は語末に「￣」を付ける。根拠から表記を変換できない場合は空欄にする。
- accentTypeは「頭高型（1型）」「中高型（3型）」「平板型（0型）」のように書く。
- usageは、その候補になる意味・品詞・文脈を短く書く。
- confidenceは high / medium / low のいずれか。情報源が少ない、食い違う、二次情報しかない場合はlowにする。
- sourcesには実際に確認したページのタイトルとURLを入れる。
- 返答はMarkdownやコードフェンスを使わず、次の形のJSONオブジェクトだけにする。

{"query":"","found":true,"summary":"","confidence":"medium","candidates":[{"label":"","reading":"","notation":"","accentType":"","usage":""}],"sources":[{"title":"","url":""}],"note":""}
PROMPT;

    $response = wp_remote_post('https://api.openai.com/v1/responses', [
        'timeout' => 90,
        'redirection' => 0,
        'httpversion' => '1.1',
        'headers' => [
            'Authorization' => 'Bearer ' . $api_key,
            'Content-Type' => 'application/json; charset=utf-8',
        ],
        'body' => wp_json_encode([
            'model' => VCS_ACCENT_RESEARCH_MODEL,
            'tools' => [[
                'type' => 'web_search',
                'search_context_size' => 'medium',
                'user_location' => [
                    'type' => 'approximate',
                    'country' => 'JP',
                    'timezone' => 'Asia/Tokyo',
                ],
            ]],
            'tool_choice' => 'required',
            'input' => [[
                'role' => 'user',
                'content' => [['type' => 'input_text', 'text' => $prompt]],
            ]],
            'reasoning' => ['effort' => 'low'],
            'text' => ['verbosity' => 'low'],
            'max_output_tokens' => 1800,
            'store' => false,
            'safety_identifier' => hash('sha256', home_url('/') . '|' . vcs_accent_research_identity($request)),
        ]),
        'data_format' => 'body',
    ]);
    if (is_wp_error($response)) {
        return new WP_Error('vcs_accent_research_unreachable', 'Web検索へ接続できませんでした。時間をおいて再度お試しください。', ['status' => 502]);
    }

    $status = wp_remote_retrieve_response_code($response);
    $payload = json_decode(wp_remote_retrieve_body($response), true);
    if ($status < 200 || $status >= 300 || !is_array($payload)) {
        $message = sanitize_text_field((string) ($payload['error']['message'] ?? 'Web検索を完了できませんでした。'));
        if (401 === $status) $message = 'OpenAI APIキーを確認してください。';
        if (429 === $status) $message = 'OpenAI APIの利用上限に達しました。時間をおいて再度お試しください。';
        return new WP_Error('vcs_accent_research_error', $message, ['status' => 502]);
    }

    $answer_text = vcs_openai_response_text($payload);
    $answer_text = preg_replace('/^```(?:json)?\s*|\s*```$/u', '', trim($answer_text));
    $answer = is_string($answer_text) ? json_decode($answer_text, true) : null;
    if (!is_array($answer) && is_string($answer_text) && preg_match('/\{.*\}/s', $answer_text, $matches)) {
        $answer = json_decode($matches[0], true);
    }
    if (!is_array($answer)) {
        return new WP_Error('vcs_accent_research_invalid', 'Web検索結果を読み取れませんでした。もう一度お試しください。', ['status' => 502]);
    }

    $result = vcs_normalize_accent_research_result(
        $answer,
        vcs_collect_openai_web_sources($payload),
        $query
    );
    $searched_at = current_time('c');
    $result['searchedAt'] = $searched_at;
    return rest_ensure_response([
        'ok' => true,
        'result' => $result,
        'searchedAt' => $searched_at,
    ]);
}

function vcs_normalize_audition_title(string $value): string
{
    $normalized = preg_replace('/[\s　]+/u', '', trim($value));
    return is_string($normalized) ? $normalized : trim($value);
}

function vcs_audition_display_role_name(string $role_name): string
{
    $original = trim($role_name);
    if ('' === $original) return '';

    $display_name = preg_replace('/(?:\s*(?:\([^()]*\)|（[^（）]*）))+\s*$/u', '', $original);
    $display_name = is_string($display_name) ? trim($display_name) : '';
    return '' !== $display_name ? $display_name : $original;
}

function vcs_audition_role_description(string $role_name, string $saved_summary = ''): string
{
    $summary = trim(wp_strip_all_tags($saved_summary));
    if ('' !== $summary) {
        return function_exists('mb_substr') ? mb_substr($summary, 0, 700) : substr($summary, 0, 700);
    }

    if (!preg_match('/(?:\(([^()]*)\)|（([^（）]*)）)\s*$/u', trim($role_name), $matches)) {
        return '';
    }
    $ascii_role = (string) ($matches[1] ?? '');
    $role = trim('' !== $ascii_role ? $ascii_role : (string) ($matches[2] ?? ''));
    if ('' === $role) return '';
    if (preg_match('/[。！？!?]$/u', $role)) return $role;
    if (preg_match('/役(?:です|になります)$/u', $role)) return $role . '。';
    if (preg_match('/役$/u', $role)) return $role . 'です。';
    return $role . 'の役です。';
}

function vcs_get_audition_role_description(array $project, string $character_id, string $role_name): string
{
    foreach (($project['auditionRoleProgress'] ?? []) as $progress) {
        if (!is_array($progress) || (string) ($progress['characterId'] ?? '') !== $character_id) continue;
        return vcs_audition_role_description($role_name, (string) ($progress['auditionRoleSummary'] ?? ''));
    }
    return vcs_audition_role_description($role_name);
}

function vcs_get_audition_deadline(array $project, string $character_id, ?string $request_value = null): string
{
    $value = $request_value;
    if (null === $value) {
        $value = '';
        foreach (($project['auditionRoleProgress'] ?? []) as $progress) {
            if (!is_array($progress) || (string) ($progress['characterId'] ?? '') !== $character_id) continue;
            $value = (string) ($progress['auditionDeadline'] ?? '');
            break;
        }
    }
    $value = trim((string) $value);
    if ('' === $value) return '';
    if (!preg_match('/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/', $value, $matches)) return '';
    $normalized = $matches[1] . 'T' . $matches[2];
    $deadline = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $normalized, new DateTimeZone('Asia/Tokyo'));
    $errors = DateTimeImmutable::getLastErrors();
    if (!$deadline || (is_array($errors) && (!empty($errors['warning_count']) || !empty($errors['error_count'])))) return '';
    return $deadline->format('Y-m-d\TH:i') === $normalized ? $normalized : '';
}

function vcs_audit_audition_image(
    string $api_key,
    array $image,
    string $asset_type,
    string $required_title
): array|WP_Error {
    $base64 = (string) ($image['base64'] ?? '');
    if ('' === $base64 && is_string($image['bytes'] ?? null)) {
        $base64 = base64_encode($image['bytes']);
    }
    if ('' === $base64) {
        return new WP_Error('vcs_audition_audit_image_missing', '画像監査に必要な画像データがありません。', ['status' => 500]);
    }

    $is_header = 'header' === $asset_type;
    $canvas = $is_header ? '1600x400 Google Forms header' : '1792x1008 16:9 social image';
    $safe_margin = $is_header
        ? 'at least 72 px on the left and right and 24 px on the top and bottom'
        : 'at least 90 px on the left and right and 56 px on the top and bottom';
    $audit_prompt = <<<PROMPT
You are the final preflight inspector for official Japanese voice-actor audition artwork.
Inspect this final {$canvas} pixel image itself, including all four edges.
The required exact title is: {$required_title}

Pass only when every condition below is clearly satisfied:
1. The complete required title is present with exactly the same Japanese characters, punctuation, parentheses, and role name. Line breaks and spaces may differ.
2. Every title glyph is fully visible. Nothing is cropped, truncated, hidden behind the edge, or continued outside the canvas.
3. The title has a comfortable safe margin: {$safe_margin}. Text merely touching the boundary fails.
4. The complete Umbrella Parade logo is fully visible with comfortable margins and is not cropped.
5. The character's complete face, eyes, mouth, and identity-defining features are visible. Minor intentional cropping of hair tips, accessories, shoulders, or clothing at an outer edge is acceptable and must not fail when the face and identity remain clear. Do not require the complete hairstyle or full body to fit inside the canvas.
6. There is no unrelated pseudo-text, misspelled duplicate title, or watermark.

Be strict about the title, logo, face, and unrelated text. Do not reject only because a hair tip or clothing edge is cropped. When uncertain about required text or the face, fail. Return only one JSON object with exactly these keys:
{"passed":false,"titleExact":false,"titleFullyVisible":false,"safeMargins":false,"logoFullyVisible":false,"characterVisible":false,"noUnrelatedText":false,"detectedTitle":"","issues":["short issue"],"correction":"specific layout correction for the next image generation"}
PROMPT;

    $response = wp_remote_post('https://api.openai.com/v1/responses', [
        'timeout' => 90,
        'redirection' => 0,
        'httpversion' => '1.1',
        'headers' => [
            'Authorization' => 'Bearer ' . $api_key,
            'Content-Type' => 'application/json; charset=utf-8',
        ],
        'body' => wp_json_encode([
            'model' => VCS_AUDITION_AUDIT_MODEL,
            'input' => [[
                'role' => 'user',
                'content' => [
                    ['type' => 'input_text', 'text' => $audit_prompt],
                    [
                        'type' => 'input_image',
                        'image_url' => 'data:image/png;base64,' . $base64,
                        'detail' => 'original',
                    ],
                ],
            ]],
            'reasoning' => ['effort' => 'low'],
            'text' => ['verbosity' => 'low'],
            'max_output_tokens' => 800,
            'store' => false,
            'safety_identifier' => hash('sha256', home_url('/') . '|' . get_current_user_id()),
        ]),
        'data_format' => 'body',
    ]);
    if (is_wp_error($response)) {
        return new WP_Error('vcs_audition_audit_unreachable', '生成画像を監査できませんでした。時間をおいて再度お試しください。', ['status' => 502]);
    }
    $status = wp_remote_retrieve_response_code($response);
    $payload = json_decode(wp_remote_retrieve_body($response), true);
    if ($status < 200 || $status >= 300 || !is_array($payload)) {
        $message = sanitize_text_field((string) ($payload['error']['message'] ?? '生成画像の監査に失敗しました。'));
        if (401 === $status) $message = 'OpenAI APIキーを確認してください。';
        return new WP_Error('vcs_audition_audit_error', $message, ['status' => 502]);
    }

    $audit_text = vcs_openai_response_text($payload);
    $audit_text = preg_replace('/^```(?:json)?\s*|\s*```$/u', '', trim($audit_text));
    $audit = is_string($audit_text) ? json_decode($audit_text, true) : null;
    if (!is_array($audit) && is_string($audit_text) && preg_match('/\{.*\}/s', $audit_text, $matches)) {
        $audit = json_decode($matches[0], true);
    }
    if (!is_array($audit)) {
        return new WP_Error('vcs_audition_audit_invalid', '画像監査の結果を読み取れませんでした。', ['status' => 502]);
    }

    $issues = [];
    foreach (($audit['issues'] ?? []) as $issue) {
        if (is_string($issue) && '' !== trim($issue)) $issues[] = sanitize_text_field($issue);
        if (count($issues) >= 6) break;
    }
    $detected_title = sanitize_text_field((string) ($audit['detectedTitle'] ?? ''));
    $title_matches = vcs_normalize_audition_title($detected_title) === vcs_normalize_audition_title($required_title);
    $passed = !empty($audit['passed'])
        && !empty($audit['titleExact'])
        && !empty($audit['titleFullyVisible'])
        && !empty($audit['safeMargins'])
        && !empty($audit['logoFullyVisible'])
        && !empty($audit['characterVisible'])
        && !empty($audit['noUnrelatedText'])
        && $title_matches;
    if (!$title_matches) $issues[] = '必須タイトルを完全一致で確認できませんでした。';

    return [
        'passed' => $passed,
        'model' => VCS_AUDITION_AUDIT_MODEL,
        'titleExact' => !empty($audit['titleExact']) && $title_matches,
        'titleFullyVisible' => !empty($audit['titleFullyVisible']),
        'safeMargins' => !empty($audit['safeMargins']),
        'logoFullyVisible' => !empty($audit['logoFullyVisible']),
        'characterVisible' => !empty($audit['characterVisible']),
        'noUnrelatedText' => !empty($audit['noUnrelatedText']),
        'detectedTitle' => $detected_title,
        'issues' => array_values(array_unique($issues)),
        'correction' => sanitize_text_field((string) ($audit['correction'] ?? '文字を小さくし、四辺から十分に離してください。')),
        'checkedAt' => current_time('c'),
    ];
}

function vcs_generate_audited_audition_image(
    string $api_key,
    string $prompt,
    string $size,
    array $reference_images,
    string $asset_type,
    string $required_title,
    int $max_attempts = VCS_AUDITION_MAX_IMAGE_ATTEMPTS,
    string $initial_feedback = '',
    bool $allow_header_margin_fallback = false
): array|WP_Error {
    $attempt_limit = max(1, min(VCS_AUDITION_MAX_IMAGE_ATTEMPTS, $max_attempts));
    $retry_feedback = trim($initial_feedback);
    $attempt_images = $reference_images;
    $last_audit = [];
    $last_candidate = null;
    for ($attempt = 1; $attempt <= $attempt_limit; $attempt++) {
        $attempt_prompt = $prompt;
        if ('' !== $retry_feedback) {
            $previous_candidate_note = count($attempt_images) > count($reference_images)
                ? 'Input image 3 is the previous rejected candidate. Keep its strong visual direction, but create a corrected new layout.'
                : 'A previous candidate was rejected by automatic preflight. Create a corrected new layout.';
            $attempt_prompt .= " {$previous_candidate_note} Automatic preflight rejected it for: {$retry_feedback}. Use smaller title lettering and increase the empty margin around every word and logo. Do not repeat the rejected edge placement.";
        }
        $generated = vcs_generate_audition_image($api_key, $attempt_prompt, $size, $attempt_images);
        if (is_wp_error($generated)) return $generated;
        $candidate = 'header' === $asset_type ? vcs_crop_audition_header($generated) : $generated;
        if (is_wp_error($candidate)) return $candidate;
        $last_candidate = $candidate;

        $audit = vcs_audit_audition_image($api_key, $candidate, $asset_type, $required_title);
        if (is_wp_error($audit)) return $audit;
        $last_audit = $audit;
        if (!empty($audit['passed'])) {
            return [
                'image' => $candidate,
                'audit' => $audit,
                'attempts' => $attempt,
            ];
        }

        $issue_text = implode(' / ', $audit['issues'] ?? []);
        $retry_feedback = trim($issue_text . ' ' . (string) ($audit['correction'] ?? ''));
        $attempt_images = array_merge($reference_images, [[
            'bytes' => $candidate['bytes'],
            'mimeType' => 'image/png',
            'fileName' => 'rejected-' . $asset_type . '-candidate.png',
        ]]);
    }

    $header_margin_only = $allow_header_margin_fallback
        && 'header' === $asset_type
        && is_array($last_candidate)
        && !empty($last_audit['titleExact'])
        && !empty($last_audit['titleFullyVisible'])
        && !empty($last_audit['logoFullyVisible'])
        && !empty($last_audit['characterVisible'])
        && !empty($last_audit['noUnrelatedText']);
    if ($header_margin_only) {
        $last_audit['passed'] = true;
        $last_audit['acceptedWithMarginWarning'] = true;
        return [
            'image' => $last_candidate,
            'audit' => $last_audit,
            'attempts' => $attempt_limit,
        ];
    }

    $issues = implode('、', $last_audit['issues'] ?? []);
    $message = "画像監査に{$attempt_limit}回合格できなかったため、Driveには保存しませんでした。";
    if ('' !== $issues) $message .= ' 確認事項：' . $issues;
    return new WP_Error('vcs_audition_image_audit_failed', $message, [
        'status' => 422,
        'audit' => $last_audit,
    ]);
}

function vcs_call_audition_apps_script(string $url, string $secret, string $action, array $payload): array|WP_Error
{
    $host = strtolower((string) wp_parse_url($url, PHP_URL_HOST));
    if ('https' !== wp_parse_url($url, PHP_URL_SCHEME) || 'script.google.com' !== $host) {
        return new WP_Error('vcs_apps_script_config_invalid', 'Google連携設定が正しくありません。', ['status' => 500]);
    }
    $response = wp_remote_post($url, [
        'timeout' => 150,
        'redirection' => 0,
        'headers' => ['Content-Type' => 'application/json; charset=utf-8'],
        'body' => wp_json_encode(['secret' => $secret, 'action' => $action] + $payload),
        'data_format' => 'body',
    ]);
    if (is_wp_error($response)) {
        return new WP_Error('vcs_apps_script_unreachable', 'Google Driveへ接続できませんでした。', ['status' => 502]);
    }

    $response_code = wp_remote_retrieve_response_code($response);
    if ($response_code >= 300 && $response_code < 400) {
        $redirect_url = wp_remote_retrieve_header($response, 'location');
        $redirect_host = strtolower((string) wp_parse_url($redirect_url, PHP_URL_HOST));
        if ('https' !== wp_parse_url($redirect_url, PHP_URL_SCHEME)
            || 'script.googleusercontent.com' !== $redirect_host) {
            return new WP_Error('vcs_apps_script_redirect_invalid', 'Google連携から安全な応答を受け取れませんでした。', ['status' => 502]);
        }
        $response = wp_remote_get($redirect_url, [
            'timeout' => 150,
            'redirection' => 2,
        ]);
        if (is_wp_error($response)) {
            return new WP_Error('vcs_apps_script_unreachable', 'Google Driveから作成結果を受け取れませんでした。', ['status' => 502]);
        }
        $response_code = wp_remote_retrieve_response_code($response);
    }

    $response_body = wp_remote_retrieve_body($response);
    $result = json_decode($response_body, true);
    if ($response_code < 200
        || $response_code >= 300
        || !is_array($result)
        || empty($result['ok'])) {
        $message = sanitize_text_field((string) ($result['error'] ?? 'Google連携から作成結果を受け取れませんでした。'));
        return new WP_Error('vcs_apps_script_error', $message, ['status' => 502]);
    }
    return $result;
}

function vcs_store_audition_form_result(
    array $data,
    int $project_index,
    array $project,
    string $character_id,
    array $google_result,
    array $image_files = [],
    array $image_audit = []
): WP_REST_Response|WP_Error {
    $progress_items = is_array($project['auditionRoleProgress'] ?? null) ? $project['auditionRoleProgress'] : [];
    $existing_progress = [];
    foreach ($progress_items as $progress) {
        if (is_array($progress) && (string) ($progress['characterId'] ?? '') === $character_id) {
            $existing_progress = $progress;
            break;
        }
    }
    $form_validation = is_array($google_result['formValidation'] ?? null)
        ? vcs_canonicalize_value($google_result['formValidation'])
        : [];
    $form_structure_verified = !empty($form_validation['passed']);
    $images_replaced = !empty($google_result['imagesReplaced']);
    $updated_asset_type = sanitize_key((string) ($google_result['updatedAssetType'] ?? ''));
    $form_edit_url = esc_url_raw((string) ($google_result['formEditUrl'] ?? $existing_progress['formEditUrl'] ?? ''));
    $form_responder_url = esc_url_raw((string) ($google_result['formResponderUrl'] ?? $existing_progress['formResponderUrl'] ?? ''));
    $header_image_url = esc_url_raw((string) ($google_result['headerImageUrl'] ?? ''));
    $social_image_url = esc_url_raw((string) ($google_result['socialImageUrl'] ?? ''));
    if ('' === $header_image_url) $header_image_url = esc_url_raw((string) ($existing_progress['headerImageUrl'] ?? ''));
    if ('' === $social_image_url) $social_image_url = esc_url_raw((string) ($existing_progress['socialImageUrl'] ?? ''));
    $progress = array_merge($existing_progress, [
        'characterId' => $character_id,
        'formCreated' => $form_structure_verified
            && '' !== trim($form_edit_url)
            && '' !== trim($form_responder_url),
        'formStructureVerified' => $form_structure_verified,
        'formValidation' => $form_validation,
        'headerApplied' => 'header' === $updated_asset_type || ($images_replaced && '' === $updated_asset_type)
            ? false
            : (bool) ($existing_progress['headerApplied'] ?? false),
        'uploadVerified' => (bool) ($existing_progress['uploadVerified'] ?? false),
        'recruitmentStarted' => (bool) ($existing_progress['recruitmentStarted'] ?? false),
        'formEditUrl' => $form_edit_url,
        'formResponderUrl' => $form_responder_url,
        'headerImageUrl' => $header_image_url,
        'socialImageUrl' => $social_image_url,
        'createdAt' => sanitize_text_field((string) ($existing_progress['createdAt'] ?? $google_result['createdAt'] ?? current_time('c'))),
        'updatedAt' => current_time('c'),
    ]);
    if (!empty($image_audit)) {
        $existing_audit = is_array($existing_progress['imageAudit'] ?? null) ? $existing_progress['imageAudit'] : [];
        $merged_audit = array_replace_recursive($existing_audit, vcs_canonicalize_value($image_audit));
        $merged_audit['passed'] = !empty($merged_audit['header']['passed']) && !empty($merged_audit['social']['passed']);
        $progress['imageAudit'] = $merged_audit;
    }
    $found_progress = false;
    foreach ($progress_items as $index => $item) {
        if (is_array($item) && (string) ($item['characterId'] ?? '') === $character_id) {
            $progress_items[$index] = $progress;
            $found_progress = true;
        }
    }
    if (!$found_progress) $progress_items[] = $progress;
    $data['recordingProjects'][$project_index]['auditionRoleProgress'] = array_values($progress_items);
    $write = vcs_write_workspace($data);
    if (is_wp_error($write)) return $write;

    return rest_ensure_response([
        'ok' => true,
        'progress' => $progress,
        'imageAudit' => $progress['imageAudit'] ?? [],
        'recovered' => !empty($google_result['recovered']),
        'imagesReplaced' => $images_replaced,
        'imagesStoredInGoogleDrive' => '' !== $header_image_url && '' !== $social_image_url,
        'headerThemeNeedsManualSelection' => '' !== $header_image_url,
        'uploadFolderNeedsManualVerification' => true,
    ]);
}

function vcs_rest_create_audition_form(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    if (function_exists('set_time_limit')) {
        @set_time_limit(360);
    }
    $params = $request->get_json_params();
    $project_id = sanitize_text_field((string) ($params['projectId'] ?? ''));
    $character_id = sanitize_text_field((string) ($params['characterId'] ?? ''));
    $step = sanitize_key((string) ($params['step'] ?? 'form'));
    if (!in_array($step, ['form', 'header', 'social'], true)) {
        return new WP_Error('vcs_audition_step_invalid', '自動作成の処理段階が正しくありません。', ['status' => 400]);
    }
    if ('' === $project_id || '' === $character_id) {
        return new WP_Error('vcs_audition_role_required', '作品と役を選択してください。', ['status' => 400]);
    }

    $settings = vcs_get_audition_automation_option();
    $api_key = vcs_get_audition_automation_secret($settings, 'openAiApiKey');
    $apps_script_url = vcs_get_audition_automation_secret($settings, 'appsScriptWebAppUrl');
    $apps_script_secret = vcs_get_audition_automation_secret($settings, 'appsScriptSecret');
    if ('form' !== $step && '' === $api_key) {
        return new WP_Error('vcs_openai_key_required', '先にOpenAI APIキーを保存してください。', ['status' => 409]);
    }
    if ('' === $apps_script_url || '' === $apps_script_secret) {
        return new WP_Error('vcs_apps_script_required', 'Googleフォーム連携がまだ設定されていません。', ['status' => 409]);
    }

    $data = vcs_decode_workspace(vcs_get_workspace_post(false));
    $project_index = vcs_find_project_index($data, $project_id);
    if ($project_index < 0) {
        return new WP_Error('vcs_project_not_found', '作品が見つかりません。', ['status' => 404]);
    }
    $project = $data['recordingProjects'][$project_index];
    $character = null;
    foreach (($project['characters'] ?? []) as $candidate) {
        if (is_array($candidate) && (string) ($candidate['id'] ?? '') === $character_id) {
            $character = $candidate;
            break;
        }
    }
    if (!$character) {
        return new WP_Error('vcs_character_not_found', '役が見つかりません。', ['status' => 404]);
    }
    $role_name = trim((string) ($character['name'] ?? ''));
    if ('' === $role_name) {
        return new WP_Error('vcs_character_name_required', 'キャラクター名を登録してください。', ['status' => 409]);
    }
    $audition_role_name = vcs_audition_display_role_name($role_name);
    $role_description = vcs_get_audition_role_description($project, $character_id, $role_name);
    $deadline_override = array_key_exists('auditionDeadline', $params)
        ? sanitize_text_field((string) $params['auditionDeadline'])
        : null;
    $audition_deadline = vcs_get_audition_deadline($project, $character_id, $deadline_override);

    $lock_key = 'vcs_audition_' . md5($project_id . '|' . $character_id . '|' . $step);
    if (get_transient($lock_key)) {
        return new WP_Error('vcs_audition_in_progress', 'この役の処理は現在進行中です。しばらくお待ちください。', ['status' => 409]);
    }
    set_transient($lock_key, '1', 6 * MINUTE_IN_SECONDS);

    try {
        $project_title = trim((string) ($project['title'] ?? 'Voice Cast Studio'));
        $request_key = substr(hash_hmac('sha256', $project_id . '|' . $character_id, $apps_script_secret), 0, 48);
        $lookup_result = vcs_call_audition_apps_script($apps_script_url, $apps_script_secret, 'lookupAuditionForm', [
            'requestKey' => $request_key,
            'projectTitle' => $project_title,
            'roleName' => $audition_role_name,
            'roleDescription' => $role_description,
            'auditionDeadline' => $audition_deadline,
        ]);
        if (is_wp_error($lookup_result)) return $lookup_result;

        if ('form' === $step) {
            $google_result = !empty($lookup_result['found'])
                ? $lookup_result
                : vcs_call_audition_apps_script($apps_script_url, $apps_script_secret, 'createAuditionForm', [
                    'requestKey' => $request_key,
                    'projectTitle' => $project_title,
                    'roleName' => $audition_role_name,
                    'roleDescription' => $role_description,
                    'auditionDeadline' => $audition_deadline,
                ]);
            if (is_wp_error($google_result)) return $google_result;
            return vcs_store_audition_form_result(
                $data,
                $project_index,
                $project,
                $character_id,
                $google_result
            );
        }

        if (empty($lookup_result['found'])) {
            return new WP_Error('vcs_audition_form_missing', '先にGoogleフォームを作成してください。', ['status' => 404]);
        }

        $character_image = vcs_load_audition_image((string) ($character['imageUrl'] ?? ''));
        if (is_wp_error($character_image)) return $character_image;
        $logo_image = vcs_get_audition_logo_image();
        if (is_wp_error($logo_image)) return $logo_image;
        $profile = trim(wp_strip_all_tags((string) ($character['profile'] ?? '')));
        $profile = function_exists('mb_substr') ? mb_substr($profile, 0, 700) : substr($profile, 0, 700);
        $common_prompt = "Input image 1 is the official character reference. Preserve the same character identity, face, hairstyle, outfit, colors, and overall design. Input image 2 is the official Umbrella Parade logo; reproduce it faithfully without changing its lettering or proportions. Do not add other characters, third-party logos, watermarks, or unreadable decorative text. Project: {$project_title}. Role: {$audition_role_name}. Role description: {$role_description}. Character notes: {$profile}.";

        $required_title = "「{$audition_role_name}」役オーディション";
        $asset_prompt = 'header' === $step
            ? $common_prompt . " Create polished Japanese voice-actor audition key art on a 1600x544 canvas that will be center-cropped to a final 1600x400 Google Forms header by removing 72 pixels from both the top and bottom. Reserve the entire y=0..125 area for background only: no logo, umbrella, face, title, or other essential element may enter it. Place the character mainly in x=60..620 and keep the complete face within y=135..445. Place the complete Umbrella Parade logo in x=720..1450 and y=145..265. The umbrella at the top of the logo must remain fully visible and its highest point must be below y=145. Include the exact Japanese title {$required_title}, spelled exactly, inside x=720..1450 and y=295..430. Use two or three lines and deliberately smaller lettering when the role name is long. Keep every essential element within y=130..455, leave at least 90 pixels of empty space at both horizontal edges, and do not let any glyph touch a crop boundary. Balanced contrast, professional production artwork."
            : $common_prompt . " Create polished 16:9 Japanese social-media audition artwork. Feature the character prominently, integrate the complete Umbrella Parade logo, and include the exact Japanese title {$required_title}, spelled exactly. Keep the logo, character face, and every title glyph at least 100 pixels away from all four edges. Use two or three title lines and smaller lettering when needed. Cinematic, polished, and suitable for an official voice-actor recruitment announcement.";
        $feedback = sanitize_textarea_field((string) ($params['feedback'] ?? ''));
        $feedback = function_exists('mb_substr') ? mb_substr($feedback, 0, 900) : substr($feedback, 0, 900);
        $attempt = max(1, min(VCS_AUDITION_MAX_IMAGE_ATTEMPTS, (int) ($params['attempt'] ?? 1)));
        $image_result = vcs_generate_audited_audition_image(
            $api_key,
            $asset_prompt,
            'header' === $step ? '1600x544' : '1792x1008',
            [$character_image, $logo_image],
            $step,
            $required_title,
            1,
            $feedback,
            $attempt >= VCS_AUDITION_MAX_IMAGE_ATTEMPTS
        );
        if (is_wp_error($image_result)) return $image_result;
        $image = $image_result['image'];

        $google_result = vcs_call_audition_apps_script($apps_script_url, $apps_script_secret, 'saveAuditionImage', [
            'requestKey' => $request_key,
            'projectTitle' => $project_title,
            'roleName' => $audition_role_name,
            'roleDescription' => $role_description,
            'auditionDeadline' => $audition_deadline,
            'assetType' => $step,
            'image' => ['base64' => $image['base64'], 'mimeType' => 'image/png'],
        ]);
        if (is_wp_error($google_result)) return $google_result;

        return vcs_store_audition_form_result(
            $data,
            $project_index,
            $project,
            $character_id,
            $google_result,
            [],
            [
                'model' => VCS_AUDITION_AUDIT_MODEL,
                'maxAttempts' => VCS_AUDITION_MAX_IMAGE_ATTEMPTS,
                $step => [
                    'passed' => true,
                    'attempts' => $attempt,
                    'checkedAt' => (string) ($image_result['audit']['checkedAt'] ?? current_time('c')),
                ],
            ]
        );
    } finally {
        delete_transient($lock_key);
    }
}

function vcs_rest_verify_audition_form(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $params = $request->get_json_params();
    $project_id = sanitize_text_field((string) ($params['projectId'] ?? ''));
    $character_id = sanitize_text_field((string) ($params['characterId'] ?? ''));
    if ('' === $project_id || '' === $character_id) {
        return new WP_Error('vcs_audition_role_required', '作品と役を選択してください。', ['status' => 400]);
    }

    $settings = vcs_get_audition_automation_option();
    $apps_script_url = vcs_get_audition_automation_secret($settings, 'appsScriptWebAppUrl');
    $apps_script_secret = vcs_get_audition_automation_secret($settings, 'appsScriptSecret');
    if ('' === $apps_script_url || '' === $apps_script_secret) {
        return new WP_Error('vcs_apps_script_required', 'Googleフォーム連携がまだ設定されていません。', ['status' => 409]);
    }

    $data = vcs_decode_workspace(vcs_get_workspace_post(false));
    $project_index = vcs_find_project_index($data, $project_id);
    if ($project_index < 0) {
        return new WP_Error('vcs_project_not_found', '作品が見つかりません。', ['status' => 404]);
    }
    $project = $data['recordingProjects'][$project_index];
    $character = null;
    foreach (($project['characters'] ?? []) as $candidate) {
        if (is_array($candidate) && (string) ($candidate['id'] ?? '') === $character_id) {
            $character = $candidate;
            break;
        }
    }
    if (!$character) {
        return new WP_Error('vcs_character_not_found', '役が見つかりません。', ['status' => 404]);
    }
    $original_role_name = trim((string) ($character['name'] ?? ''));
    $role_name = vcs_audition_display_role_name($original_role_name);
    $role_description = vcs_get_audition_role_description($project, $character_id, $original_role_name);
    $deadline_override = array_key_exists('auditionDeadline', $params)
        ? sanitize_text_field((string) $params['auditionDeadline'])
        : null;
    $audition_deadline = vcs_get_audition_deadline($project, $character_id, $deadline_override);
    if ('' === $role_name) {
        return new WP_Error('vcs_character_name_required', 'キャラクター名を登録してください。', ['status' => 409]);
    }

    $request_key = substr(hash_hmac('sha256', $project_id . '|' . $character_id, $apps_script_secret), 0, 48);
    $google_result = vcs_call_audition_apps_script($apps_script_url, $apps_script_secret, 'verifyAuditionForm', [
        'requestKey' => $request_key,
        'projectTitle' => trim((string) ($project['title'] ?? 'Voice Cast Studio')),
        'roleName' => $role_name,
        'roleDescription' => $role_description,
        'auditionDeadline' => $audition_deadline,
    ]);
    if (is_wp_error($google_result)) return $google_result;
    if (empty($google_result['found'])) {
        return new WP_Error('vcs_audition_form_missing', '検査するGoogleフォームが見つかりませんでした。', ['status' => 404]);
    }

    return vcs_store_audition_form_result(
        $data,
        $project_index,
        $project,
        $character_id,
        $google_result
    );
}

function vcs_normalize_x_profile_url(string $value): string
{
    $source = trim($value);
    if ('' === $source) return '';
    if (preg_match('/^@([A-Za-z0-9_]{1,15})$/', $source, $matches)) {
        return 'https://x.com/' . $matches[1];
    }
    if (preg_match('/^([A-Za-z0-9_]{1,15})$/', $source, $matches)) {
        return 'https://x.com/' . $matches[1];
    }
    if (preg_match('#^(?:https?://)?(?:www\.|mobile\.)?(?:x\.com|twitter\.com)/([A-Za-z0-9_]{1,15})(?:[/?#].*)?$#i', $source, $matches)) {
        return 'https://x.com/' . $matches[1];
    }
    return '';
}

function vcs_extract_google_form_id(string $value): string
{
    $source = trim($value);
    if ('' === $source) return '';
    if (preg_match('#^https?://docs\.google\.com/forms/d/([A-Za-z0-9_-]+)/#i', $source, $matches)) {
        return sanitize_text_field($matches[1]);
    }
    return '';
}

function vcs_rest_list_audition_applicants(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $params = $request->get_json_params();
    $project_id = sanitize_text_field((string) ($params['projectId'] ?? ''));
    if ('' === $project_id) {
        return new WP_Error('vcs_audition_project_required', '作品を選択してください。', ['status' => 400]);
    }

    $settings = vcs_get_audition_automation_option();
    $apps_script_url = vcs_get_audition_automation_secret($settings, 'appsScriptWebAppUrl');
    $apps_script_secret = vcs_get_audition_automation_secret($settings, 'appsScriptSecret');
    if ('' === $apps_script_url || '' === $apps_script_secret) {
        return new WP_Error('vcs_apps_script_required', 'Googleフォーム連携がまだ設定されていません。', ['status' => 409]);
    }

    $data = vcs_decode_workspace(vcs_get_workspace_post(false));
    $project_index = vcs_find_project_index($data, $project_id);
    if ($project_index < 0) {
        return new WP_Error('vcs_project_not_found', '作品が見つかりません。', ['status' => 404]);
    }
    $project = $data['recordingProjects'][$project_index];
    $progress_by_character = [];
    foreach (($project['auditionRoleProgress'] ?? []) as $progress) {
        if (!is_array($progress)) continue;
        $character_id = sanitize_text_field((string) ($progress['characterId'] ?? ''));
        if ('' === $character_id) continue;
        if (empty($progress['formCreated']) && '' === trim((string) ($progress['formEditUrl'] ?? '')) && '' === trim((string) ($progress['formResponderUrl'] ?? ''))) {
            continue;
        }
        $form_id = vcs_extract_google_form_id((string) ($progress['formEditUrl'] ?? ''));
        if ('' === $form_id) continue;
        $progress_by_character[$character_id] = [
            'formId' => $form_id,
        ];
    }

    $roles = [];
    foreach (($project['characters'] ?? []) as $character) {
        if (!is_array($character)) continue;
        $character_id = sanitize_text_field((string) ($character['id'] ?? ''));
        if ('' === $character_id || empty($progress_by_character[$character_id])) continue;
        $role_name = vcs_audition_display_role_name(trim((string) ($character['name'] ?? '')));
        if ('' === $role_name) continue;
        $role_progress = $progress_by_character[$character_id];
        $roles[] = [
            'characterId' => $character_id,
            'requestKey' => substr(hash_hmac('sha256', $project_id . '|' . $character_id, $apps_script_secret), 0, 48),
            'roleName' => $role_name,
            'formId' => sanitize_text_field((string) ($role_progress['formId'] ?? '')),
        ];
    }
    if (!$roles) {
        return rest_ensure_response([
            'ok' => true,
            'applicants' => [],
            'roleSummaries' => [],
            'importedAt' => current_time('c'),
        ]);
    }

    $google_result = vcs_call_audition_apps_script($apps_script_url, $apps_script_secret, 'listAuditionApplicants', [
        'roles' => $roles,
    ]);
    if (is_wp_error($google_result)) return $google_result;

    $applicants = [];
    foreach (($google_result['applicants'] ?? []) as $applicant) {
        if (!is_array($applicant)) continue;
        $name = sanitize_text_field((string) ($applicant['name'] ?? ''));
        if ('' === $name) continue;
        $social_input = sanitize_text_field((string) ($applicant['socialInput'] ?? ''));
        $social_url = vcs_normalize_x_profile_url((string) ($applicant['socialUrl'] ?? $social_input));
        $applicants[] = [
            'responseId' => sanitize_text_field((string) ($applicant['responseId'] ?? '')),
            'formId' => sanitize_text_field((string) ($applicant['formId'] ?? '')),
            'sourceCharacterId' => sanitize_text_field((string) ($applicant['sourceCharacterId'] ?? '')),
            'sourceRoleName' => sanitize_text_field((string) ($applicant['sourceRoleName'] ?? '')),
            'name' => $name,
            'socialInput' => $social_input,
            'socialUrl' => $social_url,
            'submittedAt' => sanitize_text_field((string) ($applicant['submittedAt'] ?? '')),
        ];
    }
    $role_summaries = [];
    foreach (($google_result['roleSummaries'] ?? []) as $summary) {
        if (!is_array($summary)) continue;
        $role_summaries[] = [
            'characterId' => sanitize_text_field((string) ($summary['characterId'] ?? '')),
            'roleName' => sanitize_text_field((string) ($summary['roleName'] ?? '')),
            'formId' => sanitize_text_field((string) ($summary['formId'] ?? '')),
            'responseCount' => max(0, (int) ($summary['responseCount'] ?? 0)),
            'found' => !empty($summary['found']),
        ];
    }
    return rest_ensure_response([
        'ok' => true,
        'applicants' => $applicants,
        'roleSummaries' => $role_summaries,
        'importedAt' => sanitize_text_field((string) ($google_result['importedAt'] ?? current_time('c'))),
    ]);
}

function vcs_rest_upload_image(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    if (empty($_FILES['file'])) {
        return new WP_Error('vcs_image_required', 'An image file is required.', ['status' => 400]);
    }
    $file = $_FILES['file'];
    $checked = wp_check_filetype_and_ext($file['tmp_name'], $file['name']);
    $allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!in_array($checked['type'] ?? '', $allowed, true)) {
        return new WP_Error('vcs_image_type', 'Only JPEG, PNG, and WebP images are accepted.', ['status' => 400]);
    }
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';
    $attachment_id = media_handle_upload('file', 0);
    if (is_wp_error($attachment_id)) {
        return $attachment_id;
    }
    return rest_ensure_response([
        'id' => (int) $attachment_id,
        'url' => wp_get_attachment_url($attachment_id),
    ]);
}

function vcs_register_rest_routes(): void
{
    register_rest_route(VCS_REST_NAMESPACE, '/workspace', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'vcs_rest_get_workspace',
            'permission_callback' => '__return_true',
        ],
        [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'vcs_rest_save_workspace',
            'permission_callback' => 'vcs_rest_can_manage',
        ],
    ]);
    register_rest_route(VCS_REST_NAMESPACE, '/line', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'vcs_rest_update_line',
        'permission_callback' => 'vcs_rest_actor_access',
    ]);
    register_rest_route(VCS_REST_NAMESPACE, '/line/bulk', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'vcs_rest_update_lines_bulk',
        'permission_callback' => 'vcs_rest_actor_access',
    ]);
    register_rest_route(VCS_REST_NAMESPACE, '/question', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'vcs_rest_create_question',
        'permission_callback' => 'vcs_rest_actor_access',
    ]);
    register_rest_route(VCS_REST_NAMESPACE, '/question/resolve', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'vcs_rest_resolve_question',
        'permission_callback' => 'vcs_rest_actor_access',
    ]);
    register_rest_route(VCS_REST_NAMESPACE, '/image', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'vcs_rest_upload_image',
        'permission_callback' => static fn(): bool => vcs_rest_can_manage() && current_user_can('upload_files'),
    ]);
    if (VCS_ACCENT_RESEARCH_API_ENABLED) {
        register_rest_route(VCS_REST_NAMESPACE, '/accent-research', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'vcs_rest_accent_research',
            'permission_callback' => 'vcs_rest_actor_access',
        ]);
    }
    register_rest_route(VCS_REST_NAMESPACE, '/audition-automation/settings', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'vcs_rest_get_audition_automation_settings',
            'permission_callback' => 'vcs_rest_can_edit_script',
        ],
        [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'vcs_rest_save_audition_automation_settings',
            'permission_callback' => 'vcs_rest_can_edit_script',
        ],
    ]);
    register_rest_route(VCS_REST_NAMESPACE, '/audition-automation/create', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'vcs_rest_create_audition_form',
        'permission_callback' => 'vcs_rest_can_edit_script',
    ]);
    register_rest_route(VCS_REST_NAMESPACE, '/audition-automation/verify', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'vcs_rest_verify_audition_form',
        'permission_callback' => 'vcs_rest_can_edit_script',
    ]);
    register_rest_route(VCS_REST_NAMESPACE, '/audition-automation/applicants', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'vcs_rest_list_audition_applicants',
        'permission_callback' => 'vcs_rest_can_edit_script',
    ]);
    register_rest_route(VCS_REST_NAMESPACE, '/elevenlabs/settings', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'vcs_rest_get_elevenlabs_settings',
            'permission_callback' => 'vcs_rest_can_edit_script',
        ],
        [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'vcs_rest_save_elevenlabs_settings',
            'permission_callback' => 'vcs_rest_can_edit_script',
        ],
    ]);
    register_rest_route(VCS_REST_NAMESPACE, '/elevenlabs/generate', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'vcs_rest_generate_elevenlabs_sound',
        'permission_callback' => 'vcs_rest_can_edit_script',
    ]);
}
add_action('rest_api_init', 'vcs_register_rest_routes');
