'use strict';

import { module } from 'angular';

import { AccountService, PipelineConfigService } from '@spinnaker/core';

import { KUBERNETES_LIFECYCLE_HOOK_CONFIGURER } from 'kubernetes/v1/container/lifecycleHook.component';
import { KUBERNETES_CONTAINER_ENVIRONMENT_FROM } from 'kubernetes/v1/container/environmentFrom.component';
import { KUBERNETES_V1_CONTAINER_COMMANDS_COMPONENT } from 'kubernetes/v1/container/commands.component';
import { KUBERNETES_V1_CONTAINER_ARGUMENTS_COMPONENT } from 'kubernetes/v1/container/arguments.component';
import { KUBERNETES_V1_CONTAINER_ENVIRONMENTVARIABLES_COMPONENT } from 'kubernetes/v1/container/environmentVariables.component';
import { KUBERNETES_V1_CONTAINER_VOLUMES_COMPONENT } from 'kubernetes/v1/container/volumes.component';
import { KUBERNETES_V1_CONTAINER_PORTS_COMPONENT } from 'kubernetes/v1/container/ports.component';
import { KUBERNETES_V1_CONTAINER_RESOURCES_COMPONENT } from 'kubernetes/v1/container/resources.component';
import { KUBERNETES_V1_CONTAINER_PROBE_DIRECTIVE } from 'kubernetes/v1/container/probe.directive';

export const KUBERNETES_V1_PIPELINE_STAGES_RUNJOB_CONFIGUREJOB_CONTROLLER =
  'spinnaker.kubernetes.pipeline.stage.runJobStage.configure';
export const name = KUBERNETES_V1_PIPELINE_STAGES_RUNJOB_CONFIGUREJOB_CONTROLLER; // for backwards compatibility
module(KUBERNETES_V1_PIPELINE_STAGES_RUNJOB_CONFIGUREJOB_CONTROLLER, [
  KUBERNETES_V1_CONTAINER_COMMANDS_COMPONENT,
  KUBERNETES_V1_CONTAINER_ARGUMENTS_COMPONENT,
  KUBERNETES_V1_CONTAINER_ENVIRONMENTVARIABLES_COMPONENT,
  KUBERNETES_V1_CONTAINER_VOLUMES_COMPONENT,
  KUBERNETES_V1_CONTAINER_PORTS_COMPONENT,
  KUBERNETES_V1_CONTAINER_RESOURCES_COMPONENT,
  KUBERNETES_V1_CONTAINER_PROBE_DIRECTIVE,
  KUBERNETES_LIFECYCLE_HOOK_CONFIGURER,
  KUBERNETES_CONTAINER_ENVIRONMENT_FROM,
]).controller('kubernetesConfigureJobController', [
  '$scope',
  '$uibModalInstance',
  'kubernetesImageReader',
  '$filter',
  'stage',
  'pipeline',
  function($scope, $uibModalInstance, kubernetesImageReader, $filter, stage, pipeline) {
    this.stage = stage;
    this.pipeline = pipeline;
    this.policies = ['ClusterFirst', 'Default', 'ClusterFirstWithHostNet'];
    this.pullPolicies = ['IFNOTPRESENT', 'ALWAYS', 'NEVER'];

    AccountService.getUniqueAttributeForAllAccounts('kubernetes', 'namespaces').then(namespaces => {
      this.namespaces = namespaces;
    });

    AccountService.listAccounts('kubernetes', 'v1').then(accounts => {
      this.accounts = accounts;
    });

    if (!this.stage.dnsPolicy) {
      this.stage.dnsPolicy = 'ClusterFirst';
    }

    this.contextImages = PipelineConfigService.getAllUpstreamDependencies(this.pipeline, this.stage)
      .map(stage => {
        if (stage.type !== 'findImage' && stage.type !== 'bake') {
          return;
        }

        if (stage.type === 'findImage') {
          return {
            fromContext: true,
            fromFindImage: true,
            cluster: stage.cluster,
            pattern: stage.imageNamePattern,
            repository: stage.name,
            stageId: stage.refId,
          };
        }

        return {
          fromContext: true,
          fromBake: true,
          repository: stage.ami_name,
          organization: stage.organization,
          stageId: stage.refId,
        };
      })
      .filter(image => !!image);

    this.triggerImages = (this.pipeline.triggers || [])
      .filter(trigger => trigger.type === 'docker')
      .map(image => {
        image.fromTrigger = true;
        return image;
      });

    this.searchImages = query => {
      kubernetesImageReader
        .findImages({
          provider: 'dockerRegistry',
          count: 50,
          q: query,
        })
        .then(data => {
          if (this.triggerImages) {
            data = data.concat(this.triggerImages);
          }

          if (this.contextImages) {
            data = data.concat(this.contextImages);
          }

          this.containers = _.map(data, image => {
            return {
              name: image.repository
                .replace(/_/g, '')
                .replace(/[/ ]/g, '-')
                .toLowerCase(),
              imageDescription: {
                repository: image.repository,
                tag: image.tag,
                registry: image.registry,
                fromContext: image.fromContext,
                fromTrigger: image.fromTrigger,
                fromFindImage: image.fromFindImage,
                cluster: image.cluster,
                account: image.account,
                pattern: image.pattern,
                stageId: image.stageId,
                imageId: $filter('kubernetesImageId')(image),
              },
              imagePullPolicy: 'IFNOTPRESENT',
              account: image.accountName,
              requests: {
                memory: null,
                cpu: null,
              },
              limits: {
                memory: null,
                cpu: null,
              },
              ports: [
                {
                  name: 'http',
                  containerPort: 80,
                  protocol: 'TCP',
                  hostPort: null,
                  hostIp: null,
                },
              ],
              livenessProbe: null,
              readinessProbe: null,
              envVars: [],
              envFrom: [],
              command: [],
              args: [],
              volumeMounts: [],
            };
          });
        });
    };

    this.groupByRegistry = container => {
      if (container.imageDescription) {
        if (container.imageDescription.fromContext) {
          return 'Find Image Result(s)';
        } else if (container.imageDescription.fromTrigger) {
          return 'Images from Trigger(s)';
        } else {
          return container.imageDescription.registry;
        }
      }
    };

    this.setPostStartHandler = (index, handler) => {
      if (!this.stage.containers[index].lifecycle) {
        this.stage.containers[index].lifecycle = {};
      }
      this.stage.containers[index].lifecycle.postStart = handler;
    };

    this.setPreStopHandler = (index, handler) => {
      if (!this.stage.containers[index].lifecycle) {
        this.stage.containers[index].lifecycle = {};
      }
      this.stage.containers[index].lifecycle.preStop = handler;
    };

    this.onTolerationChange = tolerations => {
      this.stage.tolerations = tolerations;
      $scope.$applyAsync();
    };

    this.submit = () => {
      $uibModalInstance.close(this.stage);
    };

    this.cancel = () => {
      $uibModalInstance.dismiss();
    };
  },
]);
