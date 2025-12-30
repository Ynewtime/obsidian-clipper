/**
 * AI Template Manager
 *
 * Handles the UI logic for the AI template generator feature.
 */

import { generalSettings } from '../utils/storage-utils';
import { getMessage } from '../utils/i18n';
import { initializeIcons } from '../icons/icons';
import {
	analyzePageForTemplate,
	createTemplateFromAnalysis,
	formatAnalysisSummary,
	TemplateAnalysisResult
} from '../utils/template-generator';
import {
	templates,
	saveTemplateSettings,
	createBlogTemplate
} from './template-manager';
import { updateTemplateList, showTemplateEditor, addPropertyToEditor } from './template-ui';
import { getDomain } from '../utils/string-utils';
import { ModelConfig, Template } from '../types/types';

let currentAnalysisResult: TemplateAnalysisResult | null = null;

/**
 * Initialize the AI template generator UI
 */
export function initializeAITemplateGenerator(): void {
	const modal = document.getElementById('ai-template-modal');
	const analyzeBtn = document.getElementById('ai-template-analyze-btn');
	const applyBtn = document.getElementById('ai-template-apply-btn');
	const cancelBtn = document.querySelector('.ai-template-cancel-btn');
	const modalBg = modal?.querySelector('.modal-bg');
	const modelSelect = document.getElementById('ai-template-model') as HTMLSelectElement;

	// Populate model select
	if (modelSelect) {
		populateModelSelect(modelSelect);
	}

	// Analyze button click handler
	if (analyzeBtn) {
		analyzeBtn.addEventListener('click', handleAnalyzeClick);
	}

	// Apply button click handler
	if (applyBtn) {
		applyBtn.addEventListener('click', handleApplyClick);
	}

	// Cancel button click handler
	if (cancelBtn) {
		cancelBtn.addEventListener('click', hideAITemplateModal);
	}

	// Modal background click handler
	if (modalBg) {
		modalBg.addEventListener('click', hideAITemplateModal);
	}
}

/**
 * Populate the model select dropdown with enabled models
 */
function populateModelSelect(select: HTMLSelectElement): void {
	select.textContent = '';

	const enabledModels = generalSettings.models.filter(m => m.enabled);

	if (enabledModels.length === 0) {
		const option = document.createElement('option');
		option.value = '';
		option.textContent = getMessage('noModelsConfigured') || 'No models configured';
		option.disabled = true;
		select.appendChild(option);
		return;
	}

	enabledModels.forEach(model => {
		const option = document.createElement('option');
		option.value = model.id;
		option.textContent = model.name;
		select.appendChild(option);
	});

	// Select the last used interpreter model if available
	if (generalSettings.interpreterModel) {
		const lastModel = enabledModels.find(m => m.id === generalSettings.interpreterModel);
		if (lastModel) {
			select.value = lastModel.id;
		}
	}
}

/**
 * Show the AI template generator modal
 */
export function showAITemplateModal(): void {
	const modal = document.getElementById('ai-template-modal');
	const urlInput = document.getElementById('ai-template-url') as HTMLInputElement;
	const resultContainer = document.getElementById('ai-template-result');
	const errorContainer = document.getElementById('ai-template-error');
	const applyBtn = document.getElementById('ai-template-apply-btn') as HTMLButtonElement;
	const analyzeBtn = document.getElementById('ai-template-analyze-btn') as HTMLButtonElement;
	const modelSelect = document.getElementById('ai-template-model') as HTMLSelectElement;

	// Reset state
	currentAnalysisResult = null;

	if (urlInput) {
		urlInput.value = '';
	}

	if (resultContainer) {
		resultContainer.style.display = 'none';
	}

	if (errorContainer) {
		errorContainer.style.display = 'none';
	}

	if (applyBtn) {
		applyBtn.style.display = 'none';
	}

	if (analyzeBtn) {
		analyzeBtn.textContent = getMessage('analyze') || 'Analyze';
		analyzeBtn.disabled = false;
	}

	// Refresh model list
	if (modelSelect) {
		populateModelSelect(modelSelect);
	}

	if (modal) {
		modal.classList.add('active');
		initializeIcons(modal);
	}
}

/**
 * Hide the AI template generator modal
 */
export function hideAITemplateModal(): void {
	const modal = document.getElementById('ai-template-modal');
	if (modal) {
		modal.classList.remove('active');
	}
}

/**
 * Handle the analyze button click
 */
async function handleAnalyzeClick(): Promise<void> {
	const urlInput = document.getElementById('ai-template-url') as HTMLInputElement;
	const modelSelect = document.getElementById('ai-template-model') as HTMLSelectElement;
	const analyzeBtn = document.getElementById('ai-template-analyze-btn') as HTMLButtonElement;
	const applyBtn = document.getElementById('ai-template-apply-btn') as HTMLButtonElement;
	const resultContainer = document.getElementById('ai-template-result');
	const resultContent = document.getElementById('ai-template-result-content');
	const errorContainer = document.getElementById('ai-template-error');
	const errorText = document.getElementById('ai-template-error-text');

	const url = urlInput?.value.trim();
	const modelId = modelSelect?.value;

	// Validate inputs
	if (!url) {
		showError(errorContainer, errorText, getMessage('pleaseEnterUrl') || 'Please enter a URL');
		return;
	}

	if (!modelId) {
		showError(errorContainer, errorText, getMessage('pleaseSelectModel') || 'Please select a model');
		return;
	}

	// Find the model config
	const modelConfig = generalSettings.models.find(m => m.id === modelId);
	if (!modelConfig) {
		showError(errorContainer, errorText, getMessage('modelNotFound') || 'Model not found');
		return;
	}

	// Check if interpreter is enabled
	if (!generalSettings.interpreterEnabled) {
		showError(
			errorContainer,
			errorText,
			getMessage('interpreterNotEnabled') || 'Please enable the Interpreter in settings first'
		);
		return;
	}

	// Hide previous results/errors
	if (resultContainer) resultContainer.style.display = 'none';
	if (errorContainer) errorContainer.style.display = 'none';
	if (applyBtn) applyBtn.style.display = 'none';

	// Update button state
	if (analyzeBtn) {
		analyzeBtn.textContent = getMessage('analyzing') || 'Analyzing...';
		analyzeBtn.disabled = true;
	}

	try {
		// Fetch the page HTML
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch page: ${response.statusText}`);
		}
		const html = await response.text();

		// Analyze the page
		currentAnalysisResult = await analyzePageForTemplate(html, modelConfig);

		// Display results
		if (resultContainer && resultContent) {
			resultContent.textContent = formatAnalysisSummary(currentAnalysisResult);
			resultContainer.style.display = 'block';
		}

		if (applyBtn) {
			applyBtn.style.display = 'inline-block';
		}
	} catch (error) {
		console.error('Error analyzing page:', error);
		showError(
			errorContainer,
			errorText,
			error instanceof Error ? error.message : 'An error occurred while analyzing the page'
		);
	} finally {
		if (analyzeBtn) {
			analyzeBtn.textContent = getMessage('analyze') || 'Analyze';
			analyzeBtn.disabled = false;
		}
	}
}

/**
 * Handle the apply button click
 */
async function handleApplyClick(): Promise<void> {
	if (!currentAnalysisResult) {
		return;
	}

	const urlInput = document.getElementById('ai-template-url') as HTMLInputElement;
	const url = urlInput?.value.trim() || '';
	const domain = getDomain(url);

	// Create a new template from the analysis
	const templateName = `${domain} Template`;
	const newTemplate = createTemplateFromAnalysis(currentAnalysisResult, templateName, domain);

	// Add the template to the list
	templates.unshift(newTemplate);

	// Save and update UI
	try {
		await saveTemplateSettings();
		updateTemplateList();
		showTemplateEditor(newTemplate);
		hideAITemplateModal();
	} catch (error) {
		console.error('Error saving template:', error);
		alert(getMessage('failedToSaveTemplate') || 'Failed to save template');
	}
}

/**
 * Show an error message
 */
function showError(
	container: HTMLElement | null,
	textElement: HTMLElement | null,
	message: string
): void {
	if (container && textElement) {
		textElement.textContent = message;
		container.style.display = 'flex';
		initializeIcons(container);
	}
}

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

/**
 * Apply analysis result to the current template instead of creating a new one
 */
export function applyAnalysisToCurrentTemplate(
	analysisResult: TemplateAnalysisResult,
	template: Template
): void {
	// This can be used to update an existing template with AI suggestions
	// For now, we just create a new template, but this could be extended
	// to merge with existing template properties
}
