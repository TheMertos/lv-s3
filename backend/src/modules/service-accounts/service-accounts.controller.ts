import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Delete,
  Param,
  Patch,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IamPolicyDto } from '../iam/dto/iam-policy.dto';
import { toIamPolicyDto } from '../iam/iam-policy.mapper';
import { IamPolicyService } from '../iam/iam-policy.service';
import { ServiceAccountsService } from './service-accounts.service';
import { CreateServiceAccountDto } from './dto/create-service-account.dto';
import { ServiceAccountCreatedDto } from './dto/service-account-created.dto';
import { ServiceAccountListItemDto } from './dto/service-account-list-item.dto';
import { AuditService } from '../audit/audit.service';
import { ApiStandardErrors } from '../../common/swagger/api-error.decorator';
import { resolveClientIp } from '../../common/client-ip';

type AuthedRequest = Request & { user: { userId: number; username?: string } };

@ApiTags('service-accounts')
@ApiBearerAuth()
@ApiStandardErrors()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('service-accounts')
export class ServiceAccountsController {
  constructor(
    private readonly svc: ServiceAccountsService,
    private readonly audit: AuditService,
    private readonly iam: IamPolicyService,
  ) {}

  @Post()
  @ApiCreatedResponse({ type: ServiceAccountCreatedDto })
  async create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateServiceAccountDto,
  ): Promise<ServiceAccountCreatedDto> {
    const created = await this.svc.create(dto.label, dto.allowedBuckets);
    await this.audit.record({
      action: 'SERVICE_ACCOUNT_CREATE',
      actorId: req.user.userId,
      actorName: req.user.username ?? null,
      resourceType: 'service_account',
      resourceId: created.accessKey,
      metadata: { label: created.label },
      ip: resolveClientIp(req, req.ip),
    });
    return created;
  }

  @Get()
  @ApiOkResponse({ type: [ServiceAccountListItemDto] })
  async list(): Promise<ServiceAccountListItemDto[]> {
    return this.svc.list();
  }

  /**
   * Lists IAM policies attached to a service account.
   * @param id - Service account id string from path
   * @returns Attached policy DTOs
   */
  @Get(':id/policies')
  @ApiOkResponse({ type: [IamPolicyDto] })
  async listPolicies(@Param('id') id: string): Promise<IamPolicyDto[]> {
    const rows = await this.iam.listForServiceAccount(Number(id));
    return rows.map(toIamPolicyDto);
  }

  @Patch(':id/disable')
  @ApiOkResponse()
  async disable(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    const accountId = Number(id);
    await this.svc.disable(accountId);
    await this.audit.record({
      action: 'SERVICE_ACCOUNT_DISABLE',
      actorId: req.user.userId,
      actorName: req.user.username ?? null,
      resourceType: 'service_account',
      resourceId: id,
      ip: resolveClientIp(req, req.ip),
    });
  }

  @Delete(':id')
  @ApiOkResponse()
  async remove(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.svc.delete(Number(id));
    await this.audit.record({
      action: 'SERVICE_ACCOUNT_DELETE',
      actorId: req.user.userId,
      actorName: req.user.username ?? null,
      resourceType: 'service_account',
      resourceId: id,
      ip: resolveClientIp(req, req.ip),
    });
  }
}
