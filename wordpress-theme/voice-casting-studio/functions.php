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

function vcs_setup_theme(): void
{
    add_theme_support('title-tag');
    show_admin_bar(false);
}
add_action('after_setup_theme', 'vcs_setup_theme');

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

function vcs_filter_project_for_actor(array $project, int $user_id, array $character_ids, string $member_id = ''): array
{
    unset($project['scriptSnapshots'], $project['sourceScriptText']);
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
    unset($project['scriptSnapshots'], $project['sourceScriptText']);
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
}
add_action('rest_api_init', 'vcs_register_rest_routes');
