import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { rateLimitApiKey } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { writeAuditEvent } from '../middleware/audit';
import { registerOrLinkKybEntity, attachDocument, attachDirector, getKybEntity } from '../services/kyb.service';
import { uploadToS3 } from '../utils/s3';
import logger from '../utils/logger';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);
router.use(rateLimitApiKey);
router.use(requirePermission('verify'));

const registrationTypeEnum = z.enum(['cac_ng', 'brs_ke', 'cipc_za', 'cimc_gh', 'other']);

// ─── POST /kyb/register ───────────────────────────────────────────────────────────────────────────
const registerSchema = z.object({
  business_name: z.string().min(2).max(255),
  registration_number: z.string().min(2).max(100),
  registration_country: z.string().length(2),
  registration_type: registrationTypeEnum,
  business_address: z.record(z.unknown()).optional()
});

router.post(
  '/register',
  validateBody(registerSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { business_name, registration_number, registration_country, registration_type, business_address } =
      req.body as z.infer<typeof registerSchema>;
    const apiKey = req.apiKey!;

    const { entity, isNewRegistration } = await registerOrLinkKybEntity({
      apiKeyId: apiKey.id,
      businessName: business_name,
      registrationNumber: registration_number,
      registrationCountry: registration_country,
      registrationType: registration_type,
      businessAddress: business_address
    });

    await writeAuditEvent(req, {
      event_type: isNewRegistration ? 'kyb_registered' : 'kyb_linked',
      result: entity.verification_status === 'verified' ? 'passed' : 'pending',
      metadata: { kyb_entity_id: entity.id, business_name }
    });

    const alreadyVerified = !isNewRegistration && entity.verification_status === 'verified';

    res.status(201).json({
      kyb_entity_id: entity.id,
      verification_status: entity.verification_status,
      already_verified: alreadyVerified,
      next_steps: alreadyVerified
        ? []
        : ['upload a registration document via POST /kyb/:id/document', 'attach at least one verified director via POST /kyb/:id/directors']
    });
  }
);

// ─── POST /kyb/:id/document ───────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/document',
  upload.single('document'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const file = req.file;
    const apiKey = req.apiKey!;

    if (!file) {
      res.status(400).json({ error: 'validation_error', message: 'document file is required' });
      return;
    }

    const existing = await getKybEntity(id, apiKey.id);
    if (!existing) {
      res.status(404).json({ error: 'not_found', message: 'KYB entity not found' });
      return;
    }

    const s3Key = `kyb-documents/${id}/${Date.now()}.${file.mimetype.split('/')[1] ?? 'bin'}`;
    try {
      await uploadToS3(s3Key, file.buffer, file.mimetype);
    } catch (err) {
      logger.error('KYB document upload failed', { error: (err as Error).message, kybEntityId: id });
      res.status(503).json({ error: 'upload_failed', message: 'Document upload failed. Try again.' });
      return;
    }

    const entity = await attachDocument(id, apiKey.id, s3Key);
    await writeAuditEvent(req, {
      event_type: 'kyb_document_uploaded',
      result: 'passed',
      metadata: { kyb_entity_id: id }
    });

    res.json({ kyb_entity_id: id, verification_status: entity?.verification_status ?? existing.verification_status });
  }
);

// ─── POST /kyb/:id/directors ───────────────────────────────────────────────────────────────────────────
const attachDirectorSchema = z.object({
  verified_identity_id: z.string().uuid(),
  role: z.string().min(2).max(100).default('director')
});

router.post(
  '/:id/directors',
  validateBody(attachDirectorSchema),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const { verified_identity_id, role } = req.body as z.infer<typeof attachDirectorSchema>;
    const apiKey = req.apiKey!;

    const result = await attachDirector(id, apiKey.id, verified_identity_id, role);
    if (!result.ok) {
      const status = result.error === 'kyb_entity_not_found' || result.error === 'identity_not_found' ? 404 : 400;
      res.status(status).json({ error: result.error, message: directorErrorMessage(result.error) });
      return;
    }

    await writeAuditEvent(req, {
      event_type: 'kyb_director_linked',
      result: 'passed',
      metadata: { kyb_entity_id: id, verified_identity_id, role }
    });

    res.json({ kyb_entity_id: id, verification_status: result.entity.verification_status });
  }
);

function directorErrorMessage(error: string): string {
  switch (error) {
    case 'kyb_entity_not_found':
      return 'KYB entity not found';
    case 'identity_not_found':
      return 'No verified identity found for verified_identity_id';
    case 'director_not_fully_verified':
      return 'This individual has not completed full biometric verification yet';
    default:
      return 'Could not attach director';
  }
}

// ─── GET /kyb/:id/status ───────────────────────────────────────────────────────────────────────────
router.get('/:id/status', async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const apiKey = req.apiKey!;

  const entity = await getKybEntity(id, apiKey.id);
  if (!entity) {
    res.status(404).json({ error: 'not_found', message: 'KYB entity not found' });
    return;
  }

  res.json({
    kyb_entity_id: entity.id,
    business_name: entity.business_name,
    verification_status: entity.verification_status,
    verification_level: entity.verification_level,
    trust_score: entity.trust_score,
    director_count: entity.director_identity_ids?.length ?? 0,
    has_document: !!entity.document_s3_key,
    rejection_reason: entity.rejection_reason,
    verified_at: entity.verified_at
  });
});

export default router;
