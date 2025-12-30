/**
 * AI Template Manager
 *
 * Handles template creation with AI-assisted features.
 */

import { getMessage } from '../utils/i18n';
import {
	templates,
	saveTemplateSettings,
	createBlogTemplate
} from './template-manager';
import { updateTemplateList, showTemplateEditor } from './template-ui';

/**
 * Create and add a blog template
 */
export async function handleCreateBlogTemplate(): Promise<void> {
	const blogTemplate = createBlogTemplate();

	// Add the template to the list
	templates.unshift(blogTemplate);

	// Save and update UI
	try {
		await saveTemplateSettings();
		updateTemplateList();
		showTemplateEditor(blogTemplate);
	} catch (error) {
		console.error('Error saving blog template:', error);
		alert(getMessage('failedToSaveTemplate') || 'Failed to save template');
	}
}
