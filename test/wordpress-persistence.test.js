import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const source = readFileSync(new URL("../wordpress-theme/voice-casting-studio/functions.php", import.meta.url), "utf8");
const php = process.env.VCS_PHP_BINARY || "php";
const available = spawnSync(php, ["-v"], { windowsHide: true }).status === 0;
const functions = [
  "vcs_workspace_has_embedded_audio", "vcs_workspace_recording_urls_are_drive", "vcs_write_workspace",
  "vcs_is_google_drive_url", "vcs_rest_update_line", "vcs_sanitize_retake_annotations"
].map((name) => {
  const match = source.match(new RegExp(`^function ${name}\\b[\\s\\S]*?^}`, "m"));
  assert.ok(match, `Missing PHP function ${name}`);
  return match[0];
}).join("\n");

const mocks = `
const VCS_MANAGER_CAPABILITY = 'manager';
const VCS_SCRIPT_CAPABILITY = 'owner';
const MB_IN_BYTES = 1048576;
class WP_REST_Request {
  public function __construct(private array $params) {}
  public function get_json_params(): array { return $this->params; }
}
class WP_REST_Response {
  public function __construct(public array $data) {}
}
class WP_Error {
  public function __construct(public string $code, public string $message, public array $data) {}
}
function current_user_can($cap) { return $GLOBALS['owner'] ?? false; }
function is_user_logged_in() { return true; }
function get_current_user_id() { return 1; }
function vcs_user_character_ids($project, $user) { return ['actor']; }
function vcs_get_workspace_post($create = false) { return (object) ['ID' => 1]; }
function vcs_decode_workspace($post) { return $GLOBALS['workspace']; }
function vcs_find_project_index($data, $id) { return $id === 'p' ? 0 : -1; }
function sanitize_text_field($value) { return trim(strip_tags($value)); }
function sanitize_textarea_field($value) { return trim(strip_tags($value)); }
function esc_url_raw($value) { return $value; }
function wp_parse_url($value, $component) { return parse_url($value, $component); }
function current_time($format) { return '2026-09-17T13:00:00+00:00'; }
function wp_json_encode($value, $flags) { return json_encode($value, $flags); }
function wp_slash($value) { return $value; }
function wp_update_post($args, $errors) { $GLOBALS['workspace'] = json_decode($args['post_content'], true); return 1; }
function is_wp_error($value) { return $value instanceof WP_Error; }
function get_post_meta($id, $key, $single) { return 1; }
function update_post_meta($id, $key, $value) {}
function rest_ensure_response($value) { return new WP_REST_Response($value); }
$GLOBALS['owner'] = true;
$GLOBALS['workspace'] = ['recordingProjects' => [[
  'id' => 'p', 'characters' => [['id' => 'actor']],
  'lines' => [['id' => 'line', 'characterId' => 'actor', 'recordingUrl' => '',
    'fieldUpdatedAt' => ['recordingUrl' => '2026-09-17T12:00:00.000Z']],
    ['id' => 'body', 'manualBody' => true, 'chapterId' => 'chapter', 'sceneId' => 'scene']],
  'derivedLineProgress' => []
]]];
$annotation = ['id' => 'r', 'quote' => '制御', 'start' => 3, 'end' => 5,
  'category' => 'アクセント', 'instruction' => "もう一度\\nお願いします", 'reading' => 'せいぎょ',
  'accentType' => 1, 'accentRiseAt' => 1];
`;

function run(body) {
  const result = spawnSync(php, [], {
    input: `<?php\n${mocks}\n${functions}\n${body}`,
    encoding: "utf8", windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("WordPress URL validation ignores recording field timestamps but rejects actual non-Drive URLs", { skip: !available }, () => {
  const result = run(`
    $valid = vcs_workspace_recording_urls_are_drive($GLOBALS['workspace']);
    $GLOBALS['workspace']['recordingProjects'][0]['lines'][0]['recordingUrl'] = 'https://example.test/audio.wav';
    echo json_encode([$valid, vcs_workspace_recording_urls_are_drive($GLOBALS['workspace'])]);
  `);
  assert.deepEqual(result, [true, false]);
});

test("WordPress persists retake selections and annotations for stored and derived dialogue", { skip: !available }, () => {
  for (const derived of [false, true]) {
    const result = run(`
      $result = vcs_rest_update_line(new WP_REST_Request([
        'projectId' => 'p', 'lineId' => '${derived ? "derived_line_test" : "line"}',
        'lineContext' => ['derivedFromManualBody' => true, 'sourceLineId' => 'body', 'characterId' => 'actor'],
        'patch' => ['reviewStatus' => 'リテイク', 'retakeAnnotations' => [$annotation], 'directorNote' => '再リテイク']
      ]));
      echo json_encode(['ok' => !is_wp_error($result), 'saved' => $GLOBALS['workspace']['recordingProjects'][0]]);
    `);
    assert.equal(result.ok, true);
    const line = derived ? result.saved.derivedLineProgress.derived_line_test : result.saved.lines[0];
    assert.equal(line.reviewStatus, "リテイク");
    assert.equal(line.directorNote, "再リテイク");
    assert.equal(line.retakeAnnotations[0].quote, "制御");
    assert.equal(line.retakeAnnotations[0].start, 3);
    assert.equal(line.retakeAnnotations[0].accentRiseAt, 1);
    assert.equal(line.retakeAnnotations[0].instruction, "もう一度\nお願いします");
  }
});

test("WordPress does not let actors change retake instructions", { skip: !available }, () => {
  const result = run(`
    $GLOBALS['owner'] = false;
    $result = vcs_rest_update_line(new WP_REST_Request(['projectId' => 'p', 'lineId' => 'line', 'patch' => ['retakeAnnotations' => [$annotation]]]));
    echo json_encode(['code' => $result->code, 'status' => $result->data['status']]);
  `);
  assert.deepEqual(result, { code: "vcs_line_fields_forbidden", status: 403 });
});

test("WordPress still rejects embedded audio and malformed annotation payloads", { skip: !available }, () => {
  const result = run(`
    $bad = vcs_rest_update_line(new WP_REST_Request(['projectId' => 'p', 'lineId' => 'line', 'patch' => ['retakeAnnotations' => 'invalid']]));
    $GLOBALS['workspace']['hiddenAudio'] = 'data:audio/wav;base64,AAAA';
    $audio = vcs_write_workspace($GLOBALS['workspace']);
    echo json_encode([$bad->code, $audio->code]);
  `);
  assert.deepEqual(result, ["vcs_retake_annotations_invalid", "vcs_embedded_audio_rejected"]);
});
