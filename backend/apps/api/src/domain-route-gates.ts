/** Domain route inventory. Patient GETs dispatch BD-01 policy; other entries remain gated. */
export const domainRouteGates = [
  {
    "path": "/v1/patients",
    "method": "GET",
    "decisionIds": [
      "BD-01"
    ]
  },
  {
    "path": "/v1/patients",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-02"
    ]
  },
  {
    "path": "/v1/patients/{id}",
    "method": "GET",
    "decisionIds": [
      "BD-01"
    ]
  },
  {
    "path": "/v1/patients/{id}",
    "method": "PATCH",
    "decisionIds": [
      "BD-01",
      "BD-02"
    ]
  },
  {
    "path": "/v1/doctors",
    "method": "GET",
    "decisionIds": [
      "BD-01"
    ]
  },
  {
    "path": "/v1/doctors/{id}",
    "method": "GET",
    "decisionIds": [
      "BD-01"
    ]
  },
  {
    "path": "/v1/doctors/{id}/shifts",
    "method": "GET",
    "decisionIds": [
      "BD-01"
    ]
  },
  {
    "path": "/v1/appointments",
    "method": "GET",
    "decisionIds": [
      "BD-01"
    ]
  },
  {
    "path": "/v1/appointments",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-03"
    ]
  },
  {
    "path": "/v1/appointments/availability",
    "method": "GET",
    "decisionIds": [
      "BD-01",
      "BD-03"
    ]
  },
  {
    "path": "/v1/appointments/{id}",
    "method": "GET",
    "decisionIds": [
      "BD-01"
    ]
  },
  {
    "path": "/v1/appointments/{id}",
    "method": "PATCH",
    "decisionIds": [
      "BD-01",
      "BD-03"
    ]
  },
  {
    "path": "/v1/appointments/{id}/confirm",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-03"
    ]
  },
  {
    "path": "/v1/appointments/{id}/cancel",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-03"
    ]
  },
  {
    "path": "/v1/appointments/{id}/check-in",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-03"
    ]
  },
  {
    "path": "/v1/appointments/{id}/start",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-03"
    ]
  },
  {
    "path": "/v1/appointments/{id}/complete",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-03",
      "BD-04"
    ]
  },
  {
    "path": "/v1/appointments/{id}/no-show",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-03"
    ]
  },
  {
    "path": "/v1/encounters",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-04"
    ]
  },
  {
    "path": "/v1/encounters/{id}",
    "method": "GET",
    "decisionIds": [
      "BD-01"
    ]
  },
  {
    "path": "/v1/encounters/{id}/start",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-04"
    ]
  },
  {
    "path": "/v1/encounters/{id}/complete",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-04"
    ]
  },
  {
    "path": "/v1/encounters/{id}/cancel",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-04"
    ]
  },
  {
    "path": "/v1/patients/{id}/encounters",
    "method": "GET",
    "decisionIds": [
      "BD-01"
    ]
  },
  {
    "path": "/v1/encounters/{id}/records",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-04"
    ]
  },
  {
    "path": "/v1/records/{id}",
    "method": "GET",
    "decisionIds": [
      "BD-01"
    ]
  },
  {
    "path": "/v1/records/{id}",
    "method": "PATCH",
    "decisionIds": [
      "BD-01",
      "BD-04"
    ]
  },
  {
    "path": "/v1/records/{id}/review",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-04"
    ]
  },
  {
    "path": "/v1/records/{id}/reopen",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-04"
    ]
  },
  {
    "path": "/v1/records/{id}/finalize",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-04"
    ]
  },
  {
    "path": "/v1/records/{id}/amend",
    "method": "POST",
    "decisionIds": [
      "BD-01",
      "BD-04"
    ]
  },
  {
    "path": "/v1/records/{id}/versions",
    "method": "GET",
    "decisionIds": [
      "BD-01"
    ]
  },
  {
    "path": "/v1/records/{id}/versions/{versionId}",
    "method": "GET",
    "decisionIds": [
      "BD-01"
    ]
  }
] as const;

export function matchDomainRoutes(path: string) {
  return domainRouteGates.filter(route => {
    const pattern = route.path.replace(/\{\w+\}/g, '[0-9a-fA-F-]{36}');
    return new RegExp('^' + pattern + '$').test(path);
  });
}
