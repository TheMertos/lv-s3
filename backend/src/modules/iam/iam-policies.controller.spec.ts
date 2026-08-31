import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuditService } from '../audit/audit.service';
import { IamPoliciesController } from './iam-policies.controller';
import { IamPolicyService } from './iam-policy.service';

describe('IamPoliciesController', () => {
  let controller: IamPoliciesController;
  const audit = { record: jest.fn() };
  const req = {
    user: { userId: 1, username: 'admin' },
    headers: {},
    ip: '127.0.0.1',
  } as never;

  const document = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: 's3:GetObject',
        Resource: 'arn:lv-s3:::bucket/*',
      },
    ],
  };

  const entity = {
    id: 7,
    name: 'read-only',
    document: JSON.stringify(document),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  const svc = {
    list: jest.fn(),
    create: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    attach: jest.fn(),
    detach: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IamPoliciesController],
      providers: [
        { provide: IamPolicyService, useValue: svc },
        { provide: AuditService, useValue: audit },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(IamPoliciesController);
  });

  it('lists policies as DTOs with parsed documents', async () => {
    svc.list.mockResolvedValue([entity]);
    await expect(controller.list()).resolves.toEqual([
      {
        id: 7,
        name: 'read-only',
        document,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      },
    ]);
  });

  it('creates a policy and records audit', async () => {
    svc.create.mockResolvedValue(entity);
    await expect(
      controller.create(req, { name: 'read-only', document }),
    ).resolves.toMatchObject({ id: 7, name: 'read-only', document });
    expect(svc.create).toHaveBeenCalledWith('read-only', document);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'IAM_POLICY_CREATE',
        resourceType: 'iam_policy',
        resourceId: '7',
      }),
    );
  });

  it('propagates not found on get', async () => {
    svc.get.mockRejectedValue(new NotFoundException('IAM policy not found'));
    await expect(controller.get('99')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('attaches a policy and records audit', async () => {
    svc.attach.mockResolvedValue(undefined);
    await expect(
      controller.attach(req, '7', { serviceAccountId: 3 }),
    ).resolves.toBeUndefined();
    expect(svc.attach).toHaveBeenCalledWith(7, 3);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'IAM_POLICY_ATTACH',
        resourceType: 'iam_policy',
        resourceId: '7',
        metadata: { serviceAccountId: 3 },
      }),
    );
  });

  it('detaches a policy and records audit', async () => {
    svc.detach.mockResolvedValue(undefined);
    await expect(
      controller.detach(req, '7', { serviceAccountId: 3 }),
    ).resolves.toBeUndefined();
    expect(svc.detach).toHaveBeenCalledWith(7, 3);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'IAM_POLICY_DETACH',
        resourceId: '7',
      }),
    );
  });
});
