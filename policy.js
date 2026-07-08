(function () {
  const config = window.SAJUWAR_SITE_CONFIG || {};

  function text(selector, value) {
    document.querySelectorAll(selector).forEach((node) => {
      node.textContent = value || "추후 입력";
    });
  }

  function attr(selector, name, value) {
    document.querySelectorAll(selector).forEach((node) => {
      node.setAttribute(name, value || "#");
    });
  }

  text("[data-config='serviceName']", config.serviceName);
  text("[data-config='serviceNameEn']", config.serviceNameEn);
  text("[data-config='companyName']", config.companyName);
  text("[data-config='representativeName']", config.representativeName);
  text("[data-config='businessRegistrationNumber']", config.businessRegistrationNumber);
  text("[data-config='ecommerceRegistrationNumber']", config.ecommerceRegistrationNumber);
  text("[data-config='address']", config.address);
  text("[data-config='contactEmail']", config.contactEmail);
  text("[data-config='contactPhone']", config.contactPhone);
  text("[data-config='privacyOfficerName']", config.privacyOfficerName);
  text("[data-config='privacyOfficerEmail']", config.privacyOfficerEmail);
  text("[data-config='effectiveDate']", config.effectiveDate);
  attr("[data-config-href='contactEmail']", "href", `mailto:${config.contactEmail || ""}`);
})();
