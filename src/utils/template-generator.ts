/**
 * AI Template Generator
 *
 * This module provides functionality to automatically analyze web pages
 * and generate CSS selectors for template fields using AI/LLM.
 */

import { generalSettings } from './storage-utils';
import { ModelConfig, Template, Property } from '../types/types';
import { debugLog } from './debug';

export interface TemplateAnalysisResult {
	title: SelectorRecommendation;
	author: SelectorRecommendation;
	published: SelectorRecommendation;
	content: SelectorRecommendation;
	description: SelectorRecommendation;
	categories: SelectorRecommendation;
	tags: SelectorRecommendation;
	cover: SelectorRecommendation;
	siteType: string;
	confidence: number;
	customFields?: { [key: string]: SelectorRecommendation };
}

export interface SelectorRecommendation {
	selector: string;
	attribute?: string;
	confidence: number;
	sampleValue?: string;
	useBuiltIn?: boolean; // If true, use built-in variable like {{title}} instead of {{selector:...}}
	builtInVariable?: string;
}

const SYSTEM_PROMPT = `You are an expert web scraping assistant specializing in analyzing HTML structures to extract content.

Your task is to analyze the provided HTML and identify the best CSS selectors for extracting blog/article content.

For each field, provide:
1. A CSS selector that targets the element
2. An optional attribute if the value is in an attribute (e.g., "content" for meta tags, "href" for links)
3. A confidence score (0-1)
4. A sample value if you can extract it

Consider these common patterns:
- Meta tags: <meta name="author" content="..."> or <meta property="og:..." content="...">
- Schema.org: JSON-LD scripts with @type
- Semantic HTML: <article>, <main>, <header>, <time>, etc.
- Common classes: .post-title, .article-content, .author-name, .publish-date, etc.

IMPORTANT: Obsidian Web Clipper already has built-in variables for common fields:
- {{title}} - Page title from <title> or og:title
- {{author}} - Author from meta tags or article parser
- {{published}} - Publication date from schema.org or meta tags
- {{description}} - Meta description
- {{content}} - Cleaned article content
- {{image}} - Featured image

If the built-in variable works well for a field, recommend using it instead of a custom selector.
Set "useBuiltIn": true and specify "builtInVariable" in that case.

Respond with a JSON object in this exact format:
{
  "siteType": "blog|news|documentation|forum|social|other",
  "confidence": 0.85,
  "title": {
    "selector": "h1.entry-title",
    "confidence": 0.95,
    "sampleValue": "Example Title",
    "useBuiltIn": false
  },
  "author": {
    "selector": "meta[name='author']",
    "attribute": "content",
    "confidence": 0.8,
    "sampleValue": "John Doe",
    "useBuiltIn": true,
    "builtInVariable": "author"
  },
  "published": {
    "selector": "time.post-date",
    "attribute": "datetime",
    "confidence": 0.9,
    "sampleValue": "2024-01-15",
    "useBuiltIn": true,
    "builtInVariable": "published"
  },
  "content": {
    "selector": "article.post-content",
    "confidence": 0.85,
    "useBuiltIn": true,
    "builtInVariable": "content"
  },
  "description": {
    "selector": "meta[property='og:description']",
    "attribute": "content",
    "confidence": 0.9,
    "sampleValue": "A brief description...",
    "useBuiltIn": true,
    "builtInVariable": "description"
  },
  "categories": {
    "selector": ".post-categories a",
    "confidence": 0.7,
    "sampleValue": "Technology, Programming"
  },
  "tags": {
    "selector": ".post-tags a",
    "confidence": 0.7,
    "sampleValue": "javascript, web-development"
  },
  "cover": {
    "selector": "meta[property='og:image']",
    "attribute": "content",
    "confidence": 0.85,
    "sampleValue": "https://example.com/image.jpg",
    "useBuiltIn": true,
    "builtInVariable": "image"
  },
  "customFields": {
    "comments": {
      "selector": ".comment-list .comment",
      "confidence": 0.6,
      "sampleValue": "Great article!"
    }
  }
}`;

/**
 * Analyzes the HTML content and returns recommended CSS selectors for template fields.
 */
export async function analyzePageForTemplate(
	htmlContent: string,
	model: ModelConfig
): Promise<TemplateAnalysisResult> {
	debugLog('TemplateGenerator', 'Analyzing page for template generation...');

	const provider = generalSettings.providers.find(p => p.id === model.providerId);
	if (!provider) {
		throw new Error(`Provider not found for model ${model.name}`);
	}

	if (provider.apiKeyRequired && !provider.apiKey) {
		throw new Error(`API key is not set for provider ${provider.name}`);
	}

	// Truncate HTML to avoid token limits (keep first 50KB)
	const maxLength = 50000;
	const truncatedHtml = htmlContent.length > maxLength
		? htmlContent.substring(0, maxLength) + '\n<!-- HTML truncated for analysis -->'
		: htmlContent;

	const userPrompt = `Analyze this HTML and provide CSS selectors for extracting blog/article content:

\`\`\`html
${truncatedHtml}
\`\`\`

Provide your response as a JSON object with selector recommendations for each field.`;

	let requestUrl: string;
	let requestBody: any;
	let headers: HeadersInit = {
		'Content-Type': 'application/json',
	};

	// Build request based on provider type (similar to interpreter.ts)
	if (provider.name.toLowerCase().includes('anthropic')) {
		requestUrl = provider.baseUrl;
		requestBody = {
			model: model.providerModelId,
			max_tokens: 2000,
			messages: [
				{ role: 'user', content: userPrompt }
			],
			temperature: 0.3,
			system: SYSTEM_PROMPT
		};
		headers = {
			...headers,
			'x-api-key': provider.apiKey,
			'anthropic-version': '2023-06-01',
			'anthropic-dangerous-direct-browser-access': 'true'
		};
	} else if (provider.name.toLowerCase().includes('ollama')) {
		requestUrl = provider.baseUrl;
		requestBody = {
			model: model.providerModelId,
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: userPrompt }
			],
			format: 'json',
			num_ctx: 32000,
			temperature: 0.3,
			stream: false
		};
	} else if (provider.baseUrl.includes('openai.azure.com')) {
		requestUrl = provider.baseUrl;
		requestBody = {
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: userPrompt }
			],
			max_tokens: 2000,
			temperature: 0.3,
			stream: false
		};
		headers = {
			...headers,
			'api-key': provider.apiKey
		};
	} else {
		// Default OpenAI-compatible format
		requestUrl = provider.baseUrl;
		requestBody = {
			model: model.providerModelId,
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: userPrompt }
			],
			max_tokens: 2000,
			temperature: 0.3,
			response_format: { type: 'json_object' }
		};
		headers = {
			...headers,
			'Authorization': `Bearer ${provider.apiKey}`
		};
	}

	debugLog('TemplateGenerator', `Sending request to ${provider.name}...`);

	const response = await fetch(requestUrl, {
		method: 'POST',
		headers: headers,
		body: JSON.stringify(requestBody)
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error(`${provider.name} error response:`, errorText);
		throw new Error(`${provider.name} error: ${response.statusText} ${errorText}`);
	}

	const responseText = await response.text();
	debugLog('TemplateGenerator', `Raw response:`, responseText);

	let data;
	try {
		data = JSON.parse(responseText);
	} catch (error) {
		console.error('Error parsing JSON response:', error);
		throw new Error(`Failed to parse response from ${provider.name}`);
	}

	// Extract the content based on provider type
	let llmResponseContent: string;
	if (provider.name.toLowerCase().includes('anthropic')) {
		llmResponseContent = data.content[0]?.text || '';
	} else if (provider.name.toLowerCase().includes('ollama')) {
		llmResponseContent = data.message?.content || '';
	} else {
		llmResponseContent = data.choices[0]?.message?.content || '';
	}

	// Parse the JSON response
	const jsonMatch = llmResponseContent.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		throw new Error('No JSON object found in response');
	}

	const analysisResult: TemplateAnalysisResult = JSON.parse(jsonMatch[0]);
	debugLog('TemplateGenerator', 'Analysis result:', analysisResult);

	return analysisResult;
}

/**
 * Generates a template value string based on the selector recommendation.
 */
export function generateTemplateValue(recommendation: SelectorRecommendation): string {
	if (recommendation.useBuiltIn && recommendation.builtInVariable) {
		return `{{${recommendation.builtInVariable}}}`;
	}

	if (!recommendation.selector) {
		return '';
	}

	// Use selectorHtml for content fields, selector for others
	const selectorType = recommendation.selector.toLowerCase().includes('content') ? 'selectorHtml' : 'selector';

	if (recommendation.attribute) {
		return `{{${selectorType}:"${recommendation.selector}"?${recommendation.attribute}}}`;
	}

	return `{{${selectorType}:"${recommendation.selector}"}}`;
}

/**
 * Creates a template from the analysis result.
 */
export function createTemplateFromAnalysis(
	analysisResult: TemplateAnalysisResult,
	templateName: string,
	domain: string
): Template {
	const generateId = () => Date.now().toString() + Math.random().toString(36).slice(2, 11);

	const properties: Property[] = [
		// Core fields
		{
			id: generateId(),
			name: 'title',
			value: generateTemplateValue(analysisResult.title)
		},
		{
			id: generateId(),
			name: 'author',
			value: generateTemplateValue(analysisResult.author)
		},
		{
			id: generateId(),
			name: 'published',
			value: generateTemplateValue(analysisResult.published)
		},
		{
			id: generateId(),
			name: 'description',
			value: generateTemplateValue(analysisResult.description)
		},
		// Categorization
		{
			id: generateId(),
			name: 'categories',
			value: analysisResult.categories.selector
				? generateTemplateValue(analysisResult.categories)
				: ''
		},
		{
			id: generateId(),
			name: 'tags',
			value: analysisResult.tags.selector
				? generateTemplateValue(analysisResult.tags)
				: 'clippings'
		},
		// Media
		{
			id: generateId(),
			name: 'cover',
			value: generateTemplateValue(analysisResult.cover)
		},
		// Source info
		{
			id: generateId(),
			name: 'source',
			value: '{{url}}'
		},
		{
			id: generateId(),
			name: 'site_type',
			value: analysisResult.siteType
		},
		// Dates
		{
			id: generateId(),
			name: 'created',
			value: '{{date}}'
		}
	].filter(p => p.value !== ''); // Remove empty properties

	// Add custom fields if any
	if (analysisResult.customFields) {
		for (const [fieldName, recommendation] of Object.entries(analysisResult.customFields)) {
			if (recommendation.selector) {
				properties.push({
					id: generateId(),
					name: fieldName,
					value: generateTemplateValue(recommendation)
				});
			}
		}
	}

	// Generate content format
	const contentValue = generateTemplateValue(analysisResult.content);

	return {
		id: generateId(),
		name: templateName,
		behavior: 'create',
		noteNameFormat: '{{title|safe_name}}',
		path: 'Clippings/' + domain.replace(/\./g, '-'),
		noteContentFormat: contentValue || '{{content}}',
		context: '',
		properties: properties,
		triggers: [domain]
	};
}

/**
 * Formats the analysis result as a human-readable summary.
 */
export function formatAnalysisSummary(result: TemplateAnalysisResult): string {
	const lines: string[] = [];

	lines.push(`Site Type: ${result.siteType} (confidence: ${(result.confidence * 100).toFixed(0)}%)`);
	lines.push('');
	lines.push('Detected Fields:');

	const fields = ['title', 'author', 'published', 'content', 'description', 'categories', 'tags', 'cover'] as const;

	for (const field of fields) {
		const rec = result[field];
		if (rec && (rec.selector || rec.useBuiltIn)) {
			const source = rec.useBuiltIn ? `Built-in: {{${rec.builtInVariable}}}` : `Selector: ${rec.selector}`;
			const sample = rec.sampleValue ? ` = "${rec.sampleValue.substring(0, 50)}${rec.sampleValue.length > 50 ? '...' : ''}"` : '';
			lines.push(`  - ${field}: ${source} (${(rec.confidence * 100).toFixed(0)}%)${sample}`);
		}
	}

	if (result.customFields && Object.keys(result.customFields).length > 0) {
		lines.push('');
		lines.push('Custom Fields:');
		for (const [name, rec] of Object.entries(result.customFields)) {
			if (rec.selector) {
				lines.push(`  - ${name}: ${rec.selector} (${(rec.confidence * 100).toFixed(0)}%)`);
			}
		}
	}

	return lines.join('\n');
}
