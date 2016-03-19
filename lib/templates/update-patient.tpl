? '==================================================================================\n'
? '  Update Patient\n'
? '==================================================================================\n'
/**
  1. Get the Project entity
**/
var proj = entityUtils.getObjectFromString('{{projectStatusOid}}');

if (proj) {
  ? 'Found ParticipantRecord Status {{projectStatusOid}} \n' 
}
else {
  ? 'Error => Not Found ParticipantRecord Status {{projectStatusOid}} \n'
}

/**
  2. Get the status of the project
  NOTE: The underlying table is Classification but console should look up ProjectStatus
**/
var statusRef = ApplicationEntity.getResultset('ProjectStatus').query("ID = '{{processState}}'");

/**
  3.  Process if Project and Status exist
**/
if (proj && statusRef.count() > 0) {

  //Update modified date
  proj.dateModified = new Date();

  //Update status
  proj.status = statusRef.elements.item(1);
  ? 'Updated processState => {{processState}} for patient: {{nameGiven}} {{nameFamily}}, MRN: {{candidateExtension}}, study: {{plannedStudyExtension}} \n' 
}
else {
  ? 'Error => Failed to update processState => {{processState}} for patient: {{nameGiven}} {{nameFamily}}, MRN: {{candidateExtension}}, study: {{plannedStudyExtension}} \n'
  
  ? 'Error => processState => {{processState}} does not exist\n'
}
