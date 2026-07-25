<?php
/**
 * Voice Cast Studio application shell.
 *
 * @package VoiceCastingStudio
 */

if (!defined('ABSPATH')) {
    exit;
}
?>
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php wp_head(); ?>
</head>
<body <?php body_class('voice-casting-studio-app'); ?>>
<?php wp_body_open(); ?>
<div id="root">
    <div class="vcs-booting">Voice Cast Studio</div>
</div>
<?php wp_footer(); ?>
</body>
</html>
