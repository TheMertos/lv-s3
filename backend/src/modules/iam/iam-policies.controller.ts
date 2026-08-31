import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ApiStandardErrors } from '../../common/swagger/api-error.decorator';
import { resolveClientIp } from '../../common/client-ip';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditService } from '../audit/audit.service';
import { AttachIamPolicyDto } from './dto/attach-iam-policy.dto';
import { CreateIamPolicyDto } from './dto/create-iam-policy.dto';
import { IamPolicyDto } from './dto/iam-policy.dto';
import { UpdateIamPolicyDto } from './dto/update-iam-policy.dto';
import { toIamPolicyDto } from './iam-policy.mapper';
import { IamPolicyService } from './iam-policy.service';

type AuthedRequest = Request & { user: { userId: number; username?: string } };

/**
 * Admin REST API for IAM policy CRUD and service-account attach/detach.
 */
@ApiTags('iam-policies')
@ApiBearerAuth()
@ApiStandardErrors()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('iam/policies')
export class IamPoliciesController {
  constructor(
    private readonly svc: IamPolicyService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Lists all IAM policies.
   * @returns Policy DTOs ordered by name
   */
  @Get()
  @ApiOkResponse({ type: [IamPolicyDto] })
  async list(): Promise<IamPolicyDto[]> {
    const rows = await this.svc.list();
    return rows.map(toIamPolicyDto);
  }

  /**
   * Creates a new IAM policy.
   * @param req - Authenticated admin request
   * @param dto - Name and policy document
   * @returns Created policy DTO
   */
  @Post()
  @ApiCreatedResponse({ type: IamPolicyDto })
  async create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateIamPolicyDto,
  ): Promise<IamPolicyDto> {
    const created = await this.svc.create(dto.name, dto.document);
    await this.audit.record({
      action: 'IAM_POLICY_CREATE',
      actorId: req.user.userId,
      actorName: req.user.username ?? null,
      resourceType: 'iam_policy',
      resourceId: String(created.id),
      metadata: { name: created.name },
      ip: resolveClientIp(req, req.ip),
    });
    return toIamPolicyDto(created);
  }

  /**
   * Loads one IAM policy by id.
   * @param id - Policy id string from path
   * @returns Policy DTO
   */
  @Get(':id')
  @ApiOkResponse({ type: IamPolicyDto })
  async get(@Param('id') id: string): Promise<IamPolicyDto> {
    const policy = await this.svc.get(Number(id));
    return toIamPolicyDto(policy);
  }

  /**
   * Partially updates an IAM policy.
   * @param req - Authenticated admin request
   * @param id - Policy id string from path
   * @param dto - Optional name and/or document
   * @returns Updated policy DTO
   */
  @Patch(':id')
  @ApiOkResponse({ type: IamPolicyDto })
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateIamPolicyDto,
  ): Promise<IamPolicyDto> {
    const policyId = Number(id);
    const updated = await this.svc.update(policyId, {
      name: dto.name,
      document: dto.document,
    });
    await this.audit.record({
      action: 'IAM_POLICY_UPDATE',
      actorId: req.user.userId,
      actorName: req.user.username ?? null,
      resourceType: 'iam_policy',
      resourceId: String(policyId),
      metadata: { name: updated.name },
      ip: resolveClientIp(req, req.ip),
    });
    return toIamPolicyDto(updated);
  }

  /**
   * Deletes an IAM policy and its attachments.
   * @param req - Authenticated admin request
   * @param id - Policy id string from path
   */
  @Delete(':id')
  @ApiOkResponse()
  async remove(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    const policyId = Number(id);
    await this.svc.delete(policyId);
    await this.audit.record({
      action: 'IAM_POLICY_DELETE',
      actorId: req.user.userId,
      actorName: req.user.username ?? null,
      resourceType: 'iam_policy',
      resourceId: String(policyId),
      ip: resolveClientIp(req, req.ip),
    });
  }

  /**
   * Attaches a policy to a service account.
   * @param req - Authenticated admin request
   * @param id - Policy id string from path
   * @param dto - Target service account id
   */
  @Post(':id/attach')
  @ApiOkResponse()
  async attach(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: AttachIamPolicyDto,
  ): Promise<void> {
    const policyId = Number(id);
    await this.svc.attach(policyId, dto.serviceAccountId);
    await this.audit.record({
      action: 'IAM_POLICY_ATTACH',
      actorId: req.user.userId,
      actorName: req.user.username ?? null,
      resourceType: 'iam_policy',
      resourceId: String(policyId),
      metadata: { serviceAccountId: dto.serviceAccountId },
      ip: resolveClientIp(req, req.ip),
    });
  }

  /**
   * Detaches a policy from a service account.
   * @param req - Authenticated admin request
   * @param id - Policy id string from path
   * @param dto - Target service account id
   */
  @Post(':id/detach')
  @ApiOkResponse()
  async detach(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: AttachIamPolicyDto,
  ): Promise<void> {
    const policyId = Number(id);
    await this.svc.detach(policyId, dto.serviceAccountId);
    await this.audit.record({
      action: 'IAM_POLICY_DETACH',
      actorId: req.user.userId,
      actorName: req.user.username ?? null,
      resourceType: 'iam_policy',
      resourceId: String(policyId),
      metadata: { serviceAccountId: dto.serviceAccountId },
      ip: resolveClientIp(req, req.ip),
    });
  }
}
