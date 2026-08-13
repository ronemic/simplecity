update public.summary_cards
set category_tags = array[
  case
    when concat_ws(' ', agenda_item, what_is_happening, why_it_matters) ~* '\m(curriculum|instruction|academic|assessment|textbook|course|classroom|teaching|learning|literacy|mathematics|science|language arts)\M'
      then 'Teaching & Learning'
    when concat_ws(' ', agenda_item, what_is_happening, why_it_matters) ~* '\m(budget|parcel tax|bond|funding|grant|financial|fiscal|expenditure|revenue|appropriation|audit)\M'
      then 'School Funding'
    when concat_ws(' ', agenda_item, what_is_happening, why_it_matters) ~* '\m(teacher|teachers|staff|employee|employees|personnel|hiring|recruitment|compensation|salary|salaries|benefits|labor|collective bargaining|union|professional development)\M'
      then 'Teachers & Staff'
    when concat_ws(' ', agenda_item, what_is_happening, why_it_matters) ~* '\m(enrollment|attendance area|boundary|boundaries|school assignment|transfer|transfers|interdistrict|intradistrict|registration|school capacity)\M'
      then 'Enrollment & Boundaries'
    when concat_ws(' ', agenda_item, what_is_happening, why_it_matters) ~* '\m(facility|facilities|campus|classroom|classrooms|building|construction|renovation|repair|roof|hvac|playground|asphalt|field|grounds|landscaping|paving|portable|modernization)\M'
      then 'School Buildings & Grounds'
    when concat_ws(' ', agenda_item, what_is_happening, why_it_matters) ~* '\m(safety|security|emergency|mental health|physical health|wellness|counseling|counselor|counselors|nurse|nurses|bullying|suicide prevention|social-emotional)\M'
      then 'Safety & Wellness'
    when concat_ws(' ', agenda_item, what_is_happening, why_it_matters) ~* '\m(student services|family|families|parent|parents|childcare|child care|special education|after-school|after school|nutrition|school meal|school meals|food service|food services)\M'
      then 'Students & Families'
    else 'Board & Administration'
  end
]::text[]
where jurisdiction_slug = 'los-altos-school-district'
  and category_tags <@ array[
    'Housing',
    'Transportation',
    'Public Safety',
    'Parks & Environment',
    'Budget & Taxes',
    'Business & Development',
    'Schools & Youth',
    'City Services'
  ]::text[];
